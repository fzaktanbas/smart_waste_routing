import os

import requests
from dotenv import load_dotenv

load_dotenv()

ORS_API_KEY = os.getenv("ORS_API_KEY")
ORS_BASE_URL = "https://api.openrouteservice.org"


def get_route(coordinates):
    """
    Verilen koordinatlar arasında araç rotası oluşturur.

    coordinates formatı:
    [
        [longitude, latitude],
        [longitude, latitude],
        ...
    ]
    """

    url = f"{ORS_BASE_URL}/v2/directions/driving-car"

    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json",
    }

    body = {
        "coordinates": coordinates,
    }

    response = requests.post(
        url,
        json=body,
        headers=headers,
    )

    response.raise_for_status()

    return response.json()