"""Fresh-clone launcher env loading uses real Next parsing, without credentials."""
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from launcher_env import load_environment


class LauncherEnvironment(unittest.TestCase):
    def test_env_file_keys_and_external_env_precedence(self):
        node = shutil.which('node')
        self.assertIsNotNone(node, 'Node 24 is required')
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory)
            (path / '.env').write_text('MODEL_API_KEY=fixture-base\nFURTHER_TEST_SOURCE=base\n')
            (path / '.env.local').write_text('MODEL_API_KEY="fixture-local"\nFURTHER_TEST_SOURCE=local\n')
            (path / '.env.development.local').write_text('FURTHER_TEST_SOURCE=development\n')
            (path / '.env.production.local').write_text('FURTHER_TEST_SOURCE=production\n')
            inherited = {key:value for key,value in os.environ.items() if key not in ['NODE_ENV','__NEXT_PROCESSED_ENV','MODEL_API_KEY','FURTHER_TEST_SOURCE']}
            dev = load_environment(node, ROOT, inherited, env_dir=path)
            self.assertEqual(dev['MODEL_API_KEY'], 'fixture-local')
            self.assertEqual(dev['FURTHER_TEST_SOURCE'], 'development')
            self.assertNotIn('__NEXT_PROCESSED_ENV', dev)
            prod = load_environment(node, ROOT, inherited, production=True, env_dir=path)
            self.assertEqual(prod['FURTHER_TEST_SOURCE'], 'production')
            explicit = load_environment(node, ROOT, {**inherited,'MODEL_API_KEY':'fixture-external'}, env_dir=path)
            self.assertEqual(explicit['MODEL_API_KEY'], 'fixture-external')


if __name__ == '__main__':
    unittest.main()
