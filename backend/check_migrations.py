import sys

sys.path.insert(0, '.')

# Check that the migration chain is valid
from alembic.config import Config
from alembic.script import ScriptDirectory

cfg = Config('alembic.ini')
script = ScriptDirectory.from_config(cfg)

# List all revisions
revs = list(script.walk_revisions())
print(f'Total revisions: {len(revs)}')
for r in reversed(revs):
    print(f'  {r.revision} -> {r.down_revision} ({r.doc[:40] if r.doc else "no doc"})')

# Check what head is
heads = script.get_heads()
print(f'Head(s): {heads}')

# Check for branches or disconnected revisions
bases = [r for r in revs if r.down_revision is None]
print(f'Base revisions: {[b.revision for b in bases]}')
