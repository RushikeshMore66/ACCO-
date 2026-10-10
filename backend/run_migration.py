import sys, os, traceback
sys.path.insert(0, '.')

from alembic.config import Config
from alembic import command
import logging
logging.basicConfig(level=logging.DEBUG)

cfg = Config('alembic.ini')
try:
    result = command.upgrade(cfg, 'head')
    print('Migration result:', result)
except Exception as ex:
    print('EXCEPTION:', type(ex).__name__)
    traceback.print_exc()
