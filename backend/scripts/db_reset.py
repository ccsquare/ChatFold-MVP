#!/usr/bin/env python3
"""数据库重置脚本

用于开发环境重置数据库，清除所有数据并重新创建表结构。

使用方法:
    cd backend
    uv run python scripts/db_reset.py
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.models import Base
from app.db.mysql import engine
from app.settings import settings
from app.utils import get_logger

logger = get_logger(__name__)


def reset_database():
    """重置数据库"""

    # 安全检查：仅允许在开发环境运行
    if settings.environment not in ["local-dev", "test"]:
        logger.error("❌ Database reset is only allowed in local-dev or test environment")
        logger.error(f"   Current environment: {settings.environment}")
        sys.exit(1)

    db_type = settings.database_type
    logger.info(f"🗄️  Database type: {db_type}")

    # 如果是 SQLite，删除数据库文件
    if db_type == "sqlite":
        sqlite_path = settings.get_sqlite_path()
        if str(sqlite_path) != ":memory:" and sqlite_path.exists():
            sqlite_path.unlink()
            logger.info(f"✅ Deleted SQLite database: {sqlite_path}")
        elif str(sqlite_path) == ":memory:":
            logger.info("ℹ️  Using in-memory database (no file to delete)")
    else:
        # MySQL: 删除所有表
        logger.info("⚠️  Dropping all MySQL tables...")
        Base.metadata.drop_all(bind=engine)
        logger.info("✅ All MySQL tables dropped")

    # 重新创建所有表
    logger.info("📝 Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Database tables created successfully")

    # 显示数据库信息
    if db_type == "sqlite":
        logger.info(f"📁 SQLite database location: {settings.get_sqlite_path()}")
    else:
        logger.info("🔗 MySQL database connection established")

    logger.info("🎉 Database reset completed!")


if __name__ == "__main__":
    reset_database()
