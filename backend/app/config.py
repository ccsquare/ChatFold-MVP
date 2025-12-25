"""Application configuration."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # CORS settings
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # API settings
    api_prefix: str = ""

    class Config:
        env_prefix = "CHATFOLD_"
        env_file = ".env"


settings = Settings()
