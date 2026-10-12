import sys
import traceback

sys.path.insert(0, '.')

import logging

from alembic import command
from alembic.config import Config

logging.basicConfig(level=logging.DEBUG)

cfg = Config('alembic.ini')
try:
    result = command.upgrade(cfg, 'head')
    print('Migration result:', result)
except Exception as ex:
    print('EXCEPTION:', type(ex).__name__)
    traceback.print_exc()
