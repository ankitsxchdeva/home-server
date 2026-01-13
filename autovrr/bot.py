import os
import asyncio
import discord
from discord import app_commands
from dotenv import load_dotenv
from datetime import datetime, timedelta
from playwright.async_api import async_playwright

print("=== AUTOVRR BOT STARTING ===", flush=True)

# Load environment variables from .env file
load_dotenv()
print("Environment variables loaded", flush=True)

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")

# Check for required environment variables
if not DISCORD_TOKEN:
    raise ValueError("DISCORD_TOKEN environment variable is required. Please check your .env file.")

# VRR Parking configuration
VRR_URL = "https://app.vrrparking.com/visitors"
APARTMENT_NAME = os.getenv("APARTMENT_NAME", "Bishop Momo")
ACCESS_CODE = os.getenv("ACCESS_CODE", "")  # Some apartments require an access code

# Resident Information (Personal details)
RESIDENT_NAME = os.getenv("RESIDENT_NAME", "")
UNIT_NUMBER = os.getenv("UNIT_NUMBER", "")

# Visitor Information
VISITOR_NAME = os.getenv("VISITOR_NAME", "")
VISITOR_PHONE = os.getenv("VISITOR_PHONE", "")
VISITOR_EMAIL = os.getenv("VISITOR_EMAIL", "")

# Default vehicle for quick park
DEFAULT_LICENSE_PLATE = os.getenv("DEFAULT_LICENSE_PLATE", "")
DEFAULT_VEHICLE_MAKE = os.getenv("DEFAULT_VEHICLE_MAKE", "")
DEFAULT_VEHICLE_MODEL = os.getenv("DEFAULT_VEHICLE_MODEL", "")

print(f"Loaded apartment name: {APARTMENT_NAME}", flush=True)
print(f"Loaded unit number: {UNIT_NUMBER}", flush=True)
print(f"Loaded resident name: {RESIDENT_NAME}", flush=True)


class AutoVRRBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def on_ready(self):
        print(f'{self.user} has connected to Discord!')
        print(f'Bot is in {len(self.guilds)} guilds')
        for guild in self.guilds:
            print(f'- {guild.name} (id: {guild.id})')

    async def setup_hook(self):
        print("Setting up bot...")
        GUILD_ID = os.getenv("GUILD_ID")
        if GUILD_ID and GUILD_ID != "your_guild_id_here":
            try:
                guild = discord.Object(id=int(GUILD_ID))
                print(f"Registering commands to guild {GUILD_ID}")
                self.tree.copy_global_to(guild=guild)
                await self.tree.sync(guild=guild)
                print("Commands registered to guild!")
            except ValueError:
                print(f"Invalid GUILD_ID '{GUILD_ID}', registering commands globally instead")
                await self.tree.sync()
                print("Commands registered globally!")
        else:
            print("No valid GUILD_ID provided, registering commands globally (this may take up to 1 hour)")
            await self.tree.sync()
            print("Commands registered globally!")


client = AutoVRRBot()

print("Bot instance created, starting bot...", flush=True)


class VRRError(Exception):
    """Custom exception for VRR registration errors with clean messages."""
    pass


async def register_visitor_parking(
    license_plate: str,
    vehicle_make: str,
    vehicle_model: str,
    visitor_name: str = "",
    visitor_phone: str = "",
    visitor_email: str = ""
) -> dict:
    """
    Register a visitor's vehicle on VRR Parking website using browser automation.
    
    Form flow:
    - Step 1: Search for apartment name, select from dropdown, optionally enter access code
    - Step 2: Fill vehicle details + personal details + visitor details
    - Step 3: Verify $0.00 total, agree to terms, submit
    """
    print(f"=== Registering visitor parking on VRR ===", flush=True)
    print(f"  Apartment: {APARTMENT_NAME}", flush=True)
    print(f"  License Plate: {license_plate}", flush=True)
    print(f"  Vehicle: {vehicle_make} {vehicle_model}", flush=True)
    print(f"  Resident: {RESIDENT_NAME}, Unit: {UNIT_NUMBER}", flush=True)
    print(f"  Visitor: {visitor_name or VISITOR_NAME}", flush=True)
    print(f"  Phone: {visitor_phone or VISITOR_PHONE}", flush=True)
    
    # Use defaults from env if not provided
    visitor_name = visitor_name or VISITOR_NAME
    visitor_phone = visitor_phone or VISITOR_PHONE
    visitor_email = visitor_email or VISITOR_EMAIL
    
    browser = None
    
    try:
        async with async_playwright() as p:
            # Launch browser in headless mode
            try:
                browser = await p.chromium.launch(headless=True)
            except Exception as e:
                raise VRRError(f"Failed to launch browser: Check Chromium installation") from e
            
            context = await browser.new_context()
            page = await context.new_page()
            
            # ==================== STEP 1: Select Apartment ====================
            try:
                print(f"Navigating to {VRR_URL}...", flush=True)
                await page.goto(VRR_URL, wait_until="networkidle", timeout=30000)
                await page.wait_for_load_state("domcontentloaded")
                print("Page loaded - Step 1", flush=True)
            except Exception as e:
                raise VRRError(f"Failed to load VRR website - check your internet connection") from e
            
            # Find and fill the apartment name input
            try:
                print(f"Searching for apartment: {APARTMENT_NAME}", flush=True)
                apartment_input = page.locator('input[placeholder="Enter Apartment Name"]')
                await apartment_input.wait_for(state="visible", timeout=10000)
                await apartment_input.click()
                await apartment_input.fill(APARTMENT_NAME)
            except Exception as e:
                raise VRRError(f"Could not find apartment search field - VRR website may have changed") from e
            
            # Wait for dropdown to appear and select the apartment
            await page.wait_for_timeout(1500)
            
            try:
                apartment_option = page.locator(f'text="{APARTMENT_NAME}"').first
                if await apartment_option.count() > 0:
                    await apartment_option.click()
                    print(f"Selected apartment: {APARTMENT_NAME}", flush=True)
                else:
                    await page.locator('.property-item').first.click()
                    print(f"Selected first matching apartment option", flush=True)
            except Exception as e:
                raise VRRError(f"Apartment '{APARTMENT_NAME}' not found in dropdown") from e
            
            await page.wait_for_timeout(1000)
            
            # Check if access code is required
            access_code_input = page.locator('input[placeholder="Access code"]')
            if await access_code_input.count() > 0:
                if ACCESS_CODE:
                    print(f"Entering access code...", flush=True)
                    await access_code_input.fill(ACCESS_CODE)
                else:
                    raise VRRError(f"Apartment requires access code but ACCESS_CODE is not set in .env")
            
            # Click the Next/Continue button
            try:
                next_button = page.locator('button:has-text("Next"), button:has-text("Continue"), button[type="submit"]').first
                if await next_button.count() > 0:
                    await next_button.click()
                    print("Clicked Next button", flush=True)
                else:
                    raise VRRError("Could not find Next button on apartment selection page")
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to proceed to form page") from e
            
            await page.wait_for_timeout(2000)
            await page.wait_for_load_state("networkidle")
            
            # ==================== STEP 2: Fill Form Details ====================
            print("Step 2 - Filling form details...", flush=True)
            
            # --- Vehicle Details ---
            try:
                print(f"Filling license plate: {license_plate}", flush=True)
                plate_inputs = page.locator('input[placeholder="e.g. XXXX"]')
                plate_count = await plate_inputs.count()
                if plate_count == 0:
                    raise VRRError("License plate field not found")
                if plate_count >= 2:
                    await plate_inputs.nth(0).fill(license_plate.upper().replace(" ", ""))
                    await plate_inputs.nth(1).fill(license_plate.upper().replace(" ", ""))
                    print("Filled license plate and confirmation", flush=True)
                else:
                    await plate_inputs.first.fill(license_plate.upper().replace(" ", ""))
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to fill license plate") from e
            
            try:
                print(f"Filling vehicle make: {vehicle_make}", flush=True)
                make_input = page.locator('input[placeholder="e.g. BMW"]')
                if await make_input.count() == 0:
                    raise VRRError("Vehicle make field not found")
                await make_input.fill(vehicle_make)
                
                print(f"Filling vehicle model: {vehicle_model}", flush=True)
                model_input = page.locator('input[placeholder="e.g. Model X"]')
                if await model_input.count() == 0:
                    raise VRRError("Vehicle model field not found")
                await model_input.fill(vehicle_model)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to fill vehicle details") from e
            
            # --- Personal Details (Resident) ---
            try:
                name_inputs = page.locator('input[placeholder="e.g. John"]')
                name_count = await name_inputs.count()
                
                if RESIDENT_NAME and name_count >= 1:
                    print(f"Filling resident name: {RESIDENT_NAME}", flush=True)
                    await name_inputs.nth(0).fill(RESIDENT_NAME)
                elif not RESIDENT_NAME:
                    raise VRRError("RESIDENT_NAME not set in .env")
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to fill resident name") from e
            
            # Unit number - picklist dialog
            if not UNIT_NUMBER:
                raise VRRError("UNIT_NUMBER not set in .env")
            
            try:
                print(f"Selecting unit number: {UNIT_NUMBER}", flush=True)
                
                unit_picker_trigger = page.locator('input[readonly].cursor-pointer, input[readonly][class*="cursor-pointer"]').first
                if await unit_picker_trigger.count() == 0:
                    raise VRRError("Unit number picker not found")
                
                await unit_picker_trigger.click()
                print("Clicked unit picker to open dialog", flush=True)
                await page.wait_for_timeout(500)
                
                dialog = page.locator('.p-dialog, [role="dialog"]')
                if await dialog.count() == 0:
                    raise VRRError("Unit picker dialog did not open")
                
                print("Unit picker dialog opened", flush=True)
                
                search_input = page.locator('input[placeholder="Search Unit Number"]')
                if await search_input.count() > 0:
                    await search_input.fill(UNIT_NUMBER)
                    await page.wait_for_timeout(500)
                
                unit_option = page.locator(f'.p-dialog strong:text-is("{UNIT_NUMBER}"), [role="dialog"] strong:text-is("{UNIT_NUMBER}")')
                if await unit_option.count() > 0:
                    await unit_option.click()
                    print(f"Selected unit: {UNIT_NUMBER}", flush=True)
                else:
                    unit_row = page.locator(f'.p-dialog div.cursor-pointer:has(strong:text-is("{UNIT_NUMBER}"))')
                    if await unit_row.count() > 0:
                        await unit_row.click()
                        print(f"Selected unit row: {UNIT_NUMBER}", flush=True)
                    else:
                        raise VRRError(f"Unit '{UNIT_NUMBER}' not found in picker")
                
                await page.wait_for_timeout(500)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to select unit number") from e
            
            # --- Visitor Details ---
            try:
                if visitor_name and name_count >= 2:
                    print(f"Filling visitor name: {visitor_name}", flush=True)
                    await name_inputs.nth(1).fill(visitor_name)
                
                if visitor_phone:
                    print(f"Filling visitor phone: {visitor_phone}", flush=True)
                    phone_input = page.locator('input[placeholder="e.g. (123) 456-7890"]').first
                    if await phone_input.count() > 0:
                        await phone_input.fill(visitor_phone)
                
                if visitor_email:
                    print(f"Filling visitor email: {visitor_email}", flush=True)
                    email_input = page.locator('input[placeholder="e.g. john.doe@email.com"]')
                    if await email_input.count() > 0:
                        await email_input.fill(visitor_email)
            except Exception as e:
                raise VRRError(f"Failed to fill visitor details") from e
            
            await page.wait_for_timeout(500)
            
            try:
                await page.screenshot(path="/app/step2_filled.png")
                print("Screenshot saved: step2_filled.png", flush=True)
            except:
                pass  # Screenshot failure is not critical
            
            # ==================== PROCEED TO AGREEMENT PAGE ====================
            try:
                print("Proceeding to agreement page...", flush=True)
                next_button = page.locator('button:has-text("Next"), button:has-text("Submit"), button:has-text("Continue"), button[type="submit"]').first
                if await next_button.count() == 0:
                    raise VRRError("Could not find button to proceed to agreement page")
                await next_button.click()
                print("Clicked to proceed to agreement page", flush=True)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to proceed to agreement page") from e
            
            await page.wait_for_timeout(2000)
            await page.wait_for_load_state("networkidle")
            
            # ==================== AGREEMENT PAGE ====================
            print("Checking agreement page...", flush=True)
            
            try:
                await page.screenshot(path="/app/agreement_page.png")
            except:
                pass
            
            # Verify total is $0.00
            try:
                total_element = page.locator('text="Total amount" >> .. >> span').last
                total_verified = False
                total_text = None
                
                if await total_element.count() > 0:
                    total_text = await total_element.text_content()
                else:
                    total_section = page.locator('.font-bold:has-text("Total amount")')
                    if await total_section.count() > 0:
                        total_span = total_section.locator('span').last
                        if await total_span.count() > 0:
                            total_text = await total_span.text_content()
                
                if total_text:
                    print(f"Total amount: {total_text}", flush=True)
                    if "$0.00" not in total_text:
                        raise VRRError(f"Total amount is {total_text} - expected $0.00. Registration aborted for safety.")
                    print("✓ Total is $0.00 - safe to proceed", flush=True)
                    total_verified = True
                else:
                    print("WARNING: Could not find total amount element", flush=True)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to verify total amount") from e
            
            # Click the agreement checkbox
            try:
                print("Clicking agreement checkbox...", flush=True)
                checkbox = page.locator('input[type="checkbox"]').first
                if await checkbox.count() == 0:
                    raise VRRError("Agreement checkbox not found")
                await checkbox.click()
                print("✓ Checkbox clicked", flush=True)
                await page.wait_for_timeout(300)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to click agreement checkbox") from e
            
            # ==================== FINAL SUBMIT ====================
            try:
                print("Looking for final Submit button...", flush=True)
                submit_button = page.locator('button:has-text("Submit"):not([disabled])').first
                if await submit_button.count() == 0:
                    raise VRRError("Submit button not found or still disabled - form may be incomplete")
                await submit_button.click()
                print("✓ Form submitted!", flush=True)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to submit form") from e
            
            await page.wait_for_timeout(3000)
            
            try:
                await page.screenshot(path="/app/final_result.png")
            except:
                pass
            
            # Check for success message
            success = page.locator('text="success" i, text="confirmed" i, text="thank you" i, text="registered" i')
            success_detected = await success.count() > 0
            if success_detected:
                print("✓ Success message detected!", flush=True)
            
            await browser.close()
            
            return {
                "success": True,
                "message": "Visitor parking registered successfully on VRR",
                "details": {
                    "apartment": APARTMENT_NAME,
                    "license_plate": license_plate.upper(),
                    "vehicle": f"{vehicle_make} {vehicle_model}",
                    "resident": RESIDENT_NAME,
                    "unit": UNIT_NUMBER,
                    "visitor": visitor_name
                }
            }
    
    except VRRError as e:
        # Clean error - log and return
        print(f"ERROR: {e}", flush=True)
        if browser:
            try:
                await browser.close()
            except:
                pass
        return {
            "success": False,
            "message": str(e)
        }
    
    except Exception as e:
        # Unexpected error - log full traceback for debugging
        print(f"UNEXPECTED ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        if browser:
            try:
                await browser.close()
            except:
                pass
        return {
            "success": False,
            "message": f"Unexpected error during registration. Check logs for details."
        }


@client.tree.command(name="park", description="Register a visitor's vehicle for parking on VRR")
@app_commands.describe(
    license_plate="License plate number (e.g., ABC1234)",
    vehicle_make="Vehicle make (e.g., Toyota, BMW)",
    vehicle_model="Vehicle model (e.g., Camry, Model X)",
    visitor_name="Visitor's name (optional, uses default from config)",
    visitor_phone="Visitor's phone number (optional, uses default from config)",
    visitor_email="Visitor's email (optional, uses default from config)"
)
async def park(
    interaction: discord.Interaction,
    license_plate: str,
    vehicle_make: str,
    vehicle_model: str,
    visitor_name: str = "",
    visitor_phone: str = "",
    visitor_email: str = ""
):
    print(f"park command called by {interaction.user}", flush=True)
    await interaction.response.defer()
    
    result = await register_visitor_parking(
        license_plate, 
        vehicle_make, 
        vehicle_model,
        visitor_name,
        visitor_phone,
        visitor_email
    )
    
    if result["success"]:
        embed = discord.Embed(
            title="🚗 Visitor Parking Registered",
            description=f"Successfully registered on [VRR Parking]({VRR_URL})",
            color=discord.Color.green()
        )
        details = result.get("details", {})
        embed.add_field(name="Apartment", value=details.get("apartment", APARTMENT_NAME), inline=True)
        embed.add_field(name="License Plate", value=details.get("license_plate", license_plate.upper()), inline=True)
        embed.add_field(name="Vehicle", value=details.get("vehicle", f"{vehicle_make} {vehicle_model}"), inline=True)
        embed.add_field(name="Resident", value=details.get("resident", RESIDENT_NAME), inline=True)
        embed.add_field(name="Unit", value=details.get("unit", UNIT_NUMBER), inline=True)
        embed.add_field(name="Visitor", value=details.get("visitor", visitor_name or VISITOR_NAME), inline=True)
        
        await interaction.followup.send(embed=embed)
    else:
        embed = discord.Embed(
            title="❌ Registration Failed",
            description=result.get("message", "Unknown error"),
            color=discord.Color.red()
        )
        await interaction.followup.send(embed=embed)


@client.tree.command(name="quickpark", description="Quick register with saved vehicle info from config")
async def quickpark(interaction: discord.Interaction):
    """Quick registration using saved default vehicle info from environment variables."""
    print(f"quickpark command called by {interaction.user}", flush=True)
    
    if not all([DEFAULT_LICENSE_PLATE, DEFAULT_VEHICLE_MAKE, DEFAULT_VEHICLE_MODEL]):
        await interaction.response.send_message(
            "❌ Quick park not configured. Please set DEFAULT_LICENSE_PLATE, DEFAULT_VEHICLE_MAKE, "
            "and DEFAULT_VEHICLE_MODEL in your .env file, or use `/park` command instead.",
            ephemeral=True
        )
        return
    
    await interaction.response.defer()
    
    result = await register_visitor_parking(
        DEFAULT_LICENSE_PLATE,
        DEFAULT_VEHICLE_MAKE,
        DEFAULT_VEHICLE_MODEL
    )
    
    if result["success"]:
        embed = discord.Embed(
            title="🚗 Quick Park Registered",
            description=f"Successfully registered on [VRR Parking]({VRR_URL})",
            color=discord.Color.green()
        )
        details = result.get("details", {})
        embed.add_field(name="Apartment", value=details.get("apartment", APARTMENT_NAME), inline=True)
        embed.add_field(name="License Plate", value=details.get("license_plate", DEFAULT_LICENSE_PLATE.upper()), inline=True)
        embed.add_field(name="Vehicle", value=details.get("vehicle", f"{DEFAULT_VEHICLE_MAKE} {DEFAULT_VEHICLE_MODEL}"), inline=True)
        embed.add_field(name="Resident", value=details.get("resident", RESIDENT_NAME), inline=True)
        embed.add_field(name="Unit", value=details.get("unit", UNIT_NUMBER), inline=True)
        
        await interaction.followup.send(embed=embed)
    else:
        embed = discord.Embed(
            title="❌ Registration Failed",
            description=result.get("message", "Unknown error"),
            color=discord.Color.red()
        )
        await interaction.followup.send(embed=embed)


print("Commands defined, registering with tree...", flush=True)

print("Starting Discord client...", flush=True)
client.run(DISCORD_TOKEN)
