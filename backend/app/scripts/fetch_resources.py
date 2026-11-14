"""Download the Lunar Prospector hydrogen map used by the landing-site search.

python -m app.scripts.fetch_resources
"""

from app.config import get_settings
from app.scripts.fetch_dem import download
from app.terrain.hydrogen import HYDROGEN_FILE, HYDROGEN_SIZE, HYDROGEN_URL


def main() -> None:
    settings = get_settings()
    settings.resources_dir.mkdir(parents=True, exist_ok=True)
    download(HYDROGEN_URL, settings.resources_dir / HYDROGEN_FILE, HYDROGEN_SIZE)


if __name__ == "__main__":
    main()
