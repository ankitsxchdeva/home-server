import os
import sys
import discord
from discord import app_commands
import requests
from dotenv import load_dotenv

print("=== COMMUTE BOT STARTING ===", flush=True)

# Load environment variables from .env file
load_dotenv()
print("Environment variables loaded", flush=True)

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# Check for required environment variables
if not DISCORD_TOKEN:
    raise ValueError("DISCORD_TOKEN environment variable is required. Please check your .env file.")
if not GOOGLE_MAPS_API_KEY:
    raise ValueError("GOOGLE_MAPS_API_KEY environment variable is required. Please check your .env file.")

# Addresses
APARTMENT_ADDRESS = os.getenv("APARTMENT_ADDRESS", "1600 Amphitheatre Parkway, Mountain View, CA")
WORK_ADDRESS = os.getenv("WORK_ADDRESS", "1 Apple Park Way, Cupertino, CA")

print(f"Loaded APARTMENT address: {APARTMENT_ADDRESS}", flush=True)
print(f"Loaded WORK address: {WORK_ADDRESS}", flush=True)

class CommuteBot(discord.Client):
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
        # For testing, register commands to a single guild (fast)
        GUILD_ID = os.getenv("GUILD_ID")
        if GUILD_ID and GUILD_ID != "your_guild_id_here":
            try:
                print(f"Registering commands to guild {GUILD_ID}")
                guild = discord.Object(id=int(GUILD_ID))
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

client = CommuteBot()

print("Bot instance created, starting bot...", flush=True)

def get_commute_time(origin_address, destination_address):
    print(f"Origin address: {origin_address}", flush=True)
    print(f"Destination address: {destination_address}", flush=True)
    
    # Google Maps Directions API endpoint
    url = "https://maps.googleapis.com/maps/api/directions/json"
    
    params = {
        'origin': origin_address,
        'destination': destination_address,
        'mode': 'driving',
        'departure_time': 'now',  # Get current traffic conditions
        'traffic_model': 'best_guess',
        'key': GOOGLE_MAPS_API_KEY
    }
    
    print(f"Making Google Maps API request to: {url}", flush=True)
    print(f"Parameters: {params}", flush=True)
    
    try:
        response = requests.get(url, params=params)
        print(f"Response status code: {response.status_code}", flush=True)
        
        if response.status_code != 200:
            print(f"Response text: {response.text}", flush=True)
            
        response.raise_for_status()
        
        data = response.json()
        print(f"API response status: {data.get('status')}", flush=True)
        
        # Check Google Maps API response status
        if data['status'] != 'OK':
            print(f"Google Maps API error: {data.get('status')} - {data.get('error_message', 'No error message')}", flush=True)
            return f"API Error: {data.get('status')}"
        
        if not data.get('routes'):
            print("No routes found in response", flush=True)
            return "No route found"
        
        # Extract duration from the first route
        route = data['routes'][0]
        leg = route['legs'][0]
        
        # Try to get duration_in_traffic first (more accurate), fall back to duration
        if 'duration_in_traffic' in leg:
            duration_seconds = leg['duration_in_traffic']['value']
            duration_text = leg['duration_in_traffic']['text']
            print(f"Duration with traffic: {duration_text} ({duration_seconds} seconds)", flush=True)
        else:
            duration_seconds = leg['duration']['value']
            duration_text = leg['duration']['text']
            print(f"Duration without traffic: {duration_text} ({duration_seconds} seconds)", flush=True)
        
        # Also get distance for additional info
        distance_text = leg['distance']['text']
        print(f"Distance: {distance_text}", flush=True)
        
        return f"{duration_text} ({distance_text})"
        
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}", flush=True)
        return f"Network Error: {str(e)}"
    except KeyError as e:
        print(f"KeyError accessing response data: {e}", flush=True)
        print(f"Full response: {data}", flush=True)
        return f"API Error: Missing data in response"
    except Exception as e:
        print(f"Unexpected error: {e}", flush=True)
        return f"Error: {str(e)}"

@client.tree.command(name="gowork", description="Commute from Apartment → Work")
async def gowork(interaction: discord.Interaction):
    print(f"gowork command called by {interaction.user}")
    duration = get_commute_time(APARTMENT_ADDRESS, WORK_ADDRESS)
    await interaction.response.send_message(f"🏠 → 🏢 **Commute to Work**\n{duration}")

@client.tree.command(name="gohome", description="Commute from Work → Apartment")
async def gohome(interaction: discord.Interaction):
    print(f"gohome command called by {interaction.user}")
    duration = get_commute_time(WORK_ADDRESS, APARTMENT_ADDRESS)
    await interaction.response.send_message(f"🏢 → 🏠 **Commute to Home**\n{duration}")

print("Commands defined, registering with tree...", flush=True)

print("Starting Discord client...", flush=True)
client.run(DISCORD_TOKEN)

