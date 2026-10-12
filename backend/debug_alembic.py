import os
import sys

sys.path.insert(0, '.')

from alembic.config import Config
from alembic.script import ScriptDirectory

cfg = Config('alembic.ini')
script = ScriptDirectory.from_config(cfg)

print('Script dir:', os.path.abspath(script.dir))

# Use the internal _version_files_in method if available, or list the dir
versions_dir = os.path.join(os.path.abspath(script.dir), 'versions')
print('Expected versions dir:', versions_dir)
print('Versions dir exists:', os.path.exists(versions_dir))
if os.path.exists(versions_dir):
    files = os.listdir(versions_dir)
    print('Files in versions dir:', files[:5])

# Actually load revisions now
revs = list(script.walk_revisions())
print(f'Total revisions found: {len(revs)}')
