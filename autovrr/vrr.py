"""VRR Parking visitor registration — the Playwright form flow.

Shared by the Discord bot (bot.py) and the guest web page (park/ service,
which COPYs this file in via a repo-root build context). Keep it free of
any discord imports.
"""

import os
import re
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()

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

# Where to write step screenshots (/app inside the container; set to a local
# dir when running outside Docker)
SCREENSHOT_DIR = os.getenv("SCREENSHOT_DIR", "/app")


async def save_screenshot(page, name: str):
    try:
        path = os.path.join(SCREENSHOT_DIR, name)
        await page.screenshot(path=path, full_page=True)
        print(f"Screenshot saved: {path}", flush=True)
    except Exception as e:
        print(f"WARNING: failed to save screenshot {name}: {e}", flush=True)


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
            
            # Click Next/Continue unless the form is already open (some
            # properties, e.g. Matador, go straight from selection to the form)
            if await page.locator('input[placeholder="e.g. XXXX"]').count() == 0:
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
            else:
                print("Form opened directly after apartment selection - no Next step", flush=True)
            
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
            
            await save_screenshot(page, "step2_filled.png")
            
            # ==================== SUBMIT ====================
            # All properties end with an agreement/review page (verify $0.00
            # total -> "I agree" checkbox -> final Submit). What differs is the
            # button that leads there from the form: Next/Continue on some,
            # "Submit request" on others (e.g. Matador).
            try:
                print("Proceeding to agreement page...", flush=True)
                proceed_button = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Submit request")').first
                if await proceed_button.count() == 0:
                    raise VRRError("Could not find button to proceed to agreement page")
                if await proceed_button.is_disabled():
                    raise VRRError("Proceed button still disabled - form may be incomplete")
                await proceed_button.click()
                print("Clicked to proceed to agreement page", flush=True)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to proceed to agreement page") from e

            await page.wait_for_timeout(2000)
            await page.wait_for_load_state("networkidle")

            # ==================== AGREEMENT PAGE ====================
            print("Checking agreement page...", flush=True)

            await save_screenshot(page, "agreement_page.png")

            # Verify total is $0.00
            try:
                total_element = page.locator('text="Total amount" >> .. >> span').last
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
                else:
                    # If the page markup changed and the total can't be read,
                    # never submit blind — that's the whole point of this check.
                    raise VRRError("Could not find total amount element - cannot confirm $0.00. Registration aborted for safety.")
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
                await page.wait_for_timeout(500)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to click agreement checkbox") from e

            # ==================== FINAL SUBMIT ====================
            try:
                print("Looking for final Submit button...", flush=True)
                submit_button = page.locator('button:has-text("Submit"):visible:not([disabled])').first
                if await submit_button.count() == 0:
                    raise VRRError("Submit button not found or still disabled - form may be incomplete")
                await submit_button.click()
                print("✓ Form submitted!", flush=True)
            except VRRError:
                raise
            except Exception as e:
                raise VRRError(f"Failed to submit form") from e
            
            await page.wait_for_timeout(3000)
            
            await save_screenshot(page, "final_result.png")
            
            # Check for success message
            success = page.get_by_text(re.compile(r"success|confirmed|thank you|registered", re.IGNORECASE))
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
