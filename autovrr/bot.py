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
    """
    print(f"=== Registering visitor parking on VRR ===", flush=True)
    print(f"  Apartment: {APARTMENT_NAME}", flush=True)
    print(f"  License Plate: {license_plate}", flush=True)
    print(f"  Vehicle: {vehicle_make} {vehicle_model}", flush=True)
    print(f"  Resident: {RESIDENT_NAME}, Unit: {UNIT_NUMBER}", flush=True)
    print(f"  Visitor: {visitor_name or VISITOR_NAME}", flush=True)
    
    # Use defaults from env if not provided
    visitor_name = visitor_name or VISITOR_NAME
    visitor_phone = visitor_phone or VISITOR_PHONE
    visitor_email = visitor_email or VISITOR_EMAIL
    
    try:
        async with async_playwright() as p:
            # Launch browser in headless mode
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # ==================== STEP 1: Select Apartment ====================
            print(f"Navigating to {VRR_URL}...", flush=True)
            await page.goto(VRR_URL, wait_until="networkidle")
            await page.wait_for_load_state("domcontentloaded")
            print("Page loaded - Step 1", flush=True)
            
            # Find and fill the apartment name input
            # From HTML: placeholder="Enter Apartment Name" class="p-inputtext"
            print(f"Searching for apartment: {APARTMENT_NAME}", flush=True)
            apartment_input = page.locator('input[placeholder="Enter Apartment Name"]')
            await apartment_input.wait_for(state="visible", timeout=10000)
            await apartment_input.click()
            await apartment_input.fill(APARTMENT_NAME)
            
            # Wait for dropdown to appear and select the apartment
            await page.wait_for_timeout(1500)  # Wait for search results
            
            # Click on the apartment in the dropdown results
            # The results appear as property-item divs
            apartment_option = page.locator(f'text="{APARTMENT_NAME}"').first
            if await apartment_option.count() > 0:
                await apartment_option.click()
                print(f"Selected apartment: {APARTMENT_NAME}", flush=True)
            else:
                # Try clicking any visible option containing the apartment name
                await page.locator('.property-item').first.click()
                print(f"Selected first matching apartment option", flush=True)
            
            await page.wait_for_timeout(1000)
            
            # Check if access code is required (page2 scenario)
            access_code_input = page.locator('input[placeholder="Access code"]')
            if await access_code_input.count() > 0 and ACCESS_CODE:
                print(f"Entering access code...", flush=True)
                await access_code_input.fill(ACCESS_CODE)
            
            # Click the Next/Continue button to proceed to Step 2
            next_button = page.locator('button:has-text("Next"), button:has-text("Continue"), button[type="submit"]').first
            if await next_button.count() > 0:
                await next_button.click()
                print("Clicked Next button", flush=True)
            
            await page.wait_for_timeout(2000)
            await page.wait_for_load_state("networkidle")
            
            # ==================== STEP 2: Fill Form Details ====================
            print("Step 2 - Filling form details...", flush=True)
            
            # --- Vehicle Details ---
            # License plate (placeholder="e.g. XXXX")
            print(f"Filling license plate: {license_plate}", flush=True)
            plate_inputs = page.locator('input[placeholder="e.g. XXXX"]')
            plate_count = await plate_inputs.count()
            if plate_count >= 2:
                # First input is license plate, second is confirm license plate
                await plate_inputs.nth(0).fill(license_plate.upper().replace(" ", ""))
                await plate_inputs.nth(1).fill(license_plate.upper().replace(" ", ""))
                print("Filled license plate and confirmation", flush=True)
            elif plate_count == 1:
                await plate_inputs.first.fill(license_plate.upper().replace(" ", ""))
            
            # Vehicle make (placeholder="e.g. BMW")
            print(f"Filling vehicle make: {vehicle_make}", flush=True)
            make_input = page.locator('input[placeholder="e.g. BMW"]')
            if await make_input.count() > 0:
                await make_input.fill(vehicle_make)
            
            # Vehicle model (placeholder="e.g. Model X")
            print(f"Filling vehicle model: {vehicle_model}", flush=True)
            model_input = page.locator('input[placeholder="e.g. Model X"]')
            if await model_input.count() > 0:
                await model_input.fill(vehicle_model)
            
            # --- Personal Details (Resident) ---
            # Resident name (placeholder="e.g. John" - first one for resident)
            name_inputs = page.locator('input[placeholder="e.g. John"]')
            name_count = await name_inputs.count()
            
            if RESIDENT_NAME and name_count >= 1:
                print(f"Filling resident name: {RESIDENT_NAME}", flush=True)
                await name_inputs.nth(0).fill(RESIDENT_NAME)
            
            # Unit number - picklist dialog
            if UNIT_NUMBER:
                print(f"Selecting unit number: {UNIT_NUMBER}", flush=True)
                
                # Click the readonly input to open the unit picker dialog
                unit_picker_trigger = page.locator('input[readonly].cursor-pointer, input[readonly][class*="cursor-pointer"]').first
                if await unit_picker_trigger.count() > 0:
                    await unit_picker_trigger.click()
                    print("Clicked unit picker to open dialog", flush=True)
                    
                    # Wait for dialog to appear
                    await page.wait_for_timeout(500)
                    
                    # Look for the dialog
                    dialog = page.locator('.p-dialog, [role="dialog"]')
                    if await dialog.count() > 0:
                        print("Unit picker dialog opened", flush=True)
                        
                        # Use search field to filter
                        search_input = page.locator('input[placeholder="Search Unit Number"]')
                        if await search_input.count() > 0:
                            await search_input.fill(UNIT_NUMBER)
                            await page.wait_for_timeout(500)
                        
                        # Click on the matching unit number
                        unit_option = page.locator(f'.p-dialog strong:text-is("{UNIT_NUMBER}"), [role="dialog"] strong:text-is("{UNIT_NUMBER}")')
                        if await unit_option.count() > 0:
                            await unit_option.click()
                            print(f"Selected unit: {UNIT_NUMBER}", flush=True)
                        else:
                            # Try clicking the parent div
                            unit_row = page.locator(f'.p-dialog div.cursor-pointer:has(strong:text-is("{UNIT_NUMBER}"))')
                            if await unit_row.count() > 0:
                                await unit_row.click()
                                print(f"Selected unit row: {UNIT_NUMBER}", flush=True)
                        
                        await page.wait_for_timeout(500)
            
            # --- Visitor Details ---
            # Visitor name (placeholder="e.g. John" - second one for visitor)
            if visitor_name and name_count >= 2:
                print(f"Filling visitor name: {visitor_name}", flush=True)
                await name_inputs.nth(1).fill(visitor_name)
            
            # Phone number (placeholder="e.g. (123) 456-7890")
            if visitor_phone:
                print(f"Filling visitor phone: {visitor_phone}", flush=True)
                phone_input = page.locator('input[placeholder="e.g. (123) 456-7890"]').first
                if await phone_input.count() > 0:
                    await phone_input.fill(visitor_phone)
            
            # Email (placeholder="e.g. john.doe@email.com")
            if visitor_email:
                print(f"Filling visitor email: {visitor_email}", flush=True)
                email_input = page.locator('input[placeholder="e.g. john.doe@email.com"]')
                if await email_input.count() > 0:
                    await email_input.fill(visitor_email)
            
            await page.wait_for_timeout(500)
            
            # Take a screenshot for debugging
            await page.screenshot(path="/app/step2_filled.png")
            print("Screenshot saved: step2_filled.png", flush=True)
            
            # ==================== PROCEED TO AGREEMENT PAGE ====================
            print("Proceeding to agreement page...", flush=True)
            next_button = page.locator('button:has-text("Next"), button:has-text("Submit"), button:has-text("Continue"), button[type="submit"]').first
            if await next_button.count() > 0:
                await next_button.click()
                print("Clicked to proceed to agreement page", flush=True)
            
            await page.wait_for_timeout(2000)
            await page.wait_for_load_state("networkidle")
            
            # ==================== AGREEMENT PAGE ====================
            print("Checking agreement page...", flush=True)
            await page.screenshot(path="/app/agreement_page.png")
            
            # Verify total is $0.00
            total_element = page.locator('text="Total amount" >> .. >> span').last
            total_verified = False
            if await total_element.count() > 0:
                total_text = await total_element.text_content()
                print(f"Total amount: {total_text}", flush=True)
                
                if "$0.00" not in total_text:
                    print(f"WARNING: Total is NOT $0.00! Got: {total_text}", flush=True)
                    await browser.close()
                    return {
                        "success": False,
                        "message": f"Registration aborted: Total amount is {total_text}, expected $0.00"
                    }
                else:
                    print("✓ Total is $0.00 - safe to proceed", flush=True)
                    total_verified = True
            else:
                # Try alternative selector
                total_section = page.locator('.font-bold:has-text("Total amount")')
                if await total_section.count() > 0:
                    total_span = total_section.locator('span').last
                    if await total_span.count() > 0:
                        total_text = await total_span.text_content()
                        print(f"Total amount: {total_text}", flush=True)
                        if "$0.00" not in total_text:
                            await browser.close()
                            return {
                                "success": False,
                                "message": f"Registration aborted: Total amount is {total_text}, expected $0.00"
                            }
                        total_verified = True
            
            # Click the agreement checkbox
            print("Clicking agreement checkbox...", flush=True)
            checkbox = page.locator('input[type="checkbox"]').first
            if await checkbox.count() > 0:
                await checkbox.click()
                print("✓ Checkbox clicked", flush=True)
                await page.wait_for_timeout(300)
            else:
                print("WARNING: Checkbox not found", flush=True)
            
            # ==================== FINAL SUBMIT ====================
            print("Looking for final Submit button...", flush=True)
            submit_button = page.locator('button:has-text("Submit"):not([disabled])').first
            if await submit_button.count() > 0:
                await submit_button.click()
                print("✓ Form submitted!", flush=True)
            else:
                print("WARNING: Submit button not found or still disabled", flush=True)
            
            await page.wait_for_timeout(3000)
            await page.screenshot(path="/app/final_result.png")
            
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
            
    except Exception as e:
        print(f"Error during registration: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"Registration failed: {str(e)}"
        }


@client.tree.command(name="park", description="Register a visitor's vehicle for parking on VRR")
@app_commands.describe(
    license_plate="License plate number (e.g., ABC1234)",
    vehicle_make="Vehicle make (e.g., Toyota, BMW)",
    vehicle_model="Vehicle model (e.g., Camry, Model X)",
    visitor_name="Visitor's name (optional, uses default from config)",
    visitor_email="Visitor's email (optional, uses default from config)"
)
async def park(
    interaction: discord.Interaction,
    license_plate: str,
    vehicle_make: str,
    vehicle_model: str,
    visitor_name: str = "",
    visitor_email: str = ""
):
    print(f"park command called by {interaction.user}", flush=True)
    await interaction.response.defer()
    
    result = await register_visitor_parking(
        license_plate, 
        vehicle_make, 
        vehicle_model,
        visitor_name,
        "",  # phone
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
