"""Use Next's env-file precedence before launcher preflight; never log values."""
import json
import pathlib
import subprocess


def load_environment(node, project_root, inherited, production=False, env_dir=None):
    script = """
const {loadEnvConfig} = require('@next/env');
const result = loadEnvConfig(process.argv[1], process.argv[2] === 'development', {info(){},error(){}});
process.stdout.write(JSON.stringify(result.combinedEnv));
"""
    result = subprocess.run(
        [node, '-e', script, str(env_dir or project_root), 'production' if production else 'development'],
        cwd=pathlib.Path(project_root), env=inherited, capture_output=True, text=True,
    )
    if result.returncode:
        raise RuntimeError('Could not load environment files. Run npm ci using Node 24, then retry.')
    values = json.loads(result.stdout)
    return {key: value for key, value in values.items() if key != '__NEXT_PROCESSED_ENV'}
