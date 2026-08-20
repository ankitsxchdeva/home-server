import os
import discord
from discord import app_commands
from dotenv import load_dotenv

from vrr import (
    VRR_URL,
    APARTMENT_NAME,
    RESIDENT_NAME,
    UNIT_NUMBER,
    VISITOR_NAME,
    DEFAULT_LICENSE_PLATE,
    DEFAULT_VEHICLE_MAKE,
    DEFAULT_VEHICLE_MODEL,
    register_visitor_parking,
)

print("=== AUTOVRR BOT STARTING ===", flush=True)

# Load environment variables from .env file
load_dotenv()
print("Environment variables loaded", flush=True)

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")

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

if __name__ == "__main__":
    if not DISCORD_TOKEN:
        raise ValueError("DISCORD_TOKEN environment variable is required. Please check your .env file.")
    print("Starting Discord client...", flush=True)
    client.run(DISCORD_TOKEN)
