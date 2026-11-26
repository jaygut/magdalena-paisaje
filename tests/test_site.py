"""Portable packaging/validation regressions, using temporary miniature sites.

These tests exercise the repository maintenance tool through its public CLI.
They never edit the approved experience, its inventory or its release lock.
Run with: python3 -m unittest discover -s tests -v
"""
from __future__ import annotations

import contextlib
import csv
import functools
import hashlib
import http.server
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]
TOOL = REPOSITORY / "tools" / "site.py"
FIELDS = ["archivo", "familia", "fuente", "condiciones", "transformacion", "sha256", "sha256_fuente"]
SIGNATURE = "Story by Jay Gutiérrez, Graph of Life"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def page(body: str, title: str = "Fixture") -> str:
    return (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        f"<title>{title}</title></head><body>{body}"
        f'<span class="firma-autor" lang="en">{SIGNATURE}</span></body></html>\n'
    )


class SiteToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="magdalena-site-test-")
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.root = self.parent / "fixture"
        (self.root / "tools").mkdir(parents=True)
        self.assertTrue(TOOL.is_file(), f"Maintenance tool missing: {TOOL}")
        shutil.copyfile(TOOL, self.root / "tools" / "site.py")
        self.payload = {
            ".nojekyll": b"",
            "README.md": b"Temporary test fixture.\n",
            "index.html": page(
                '<link rel="stylesheet" href="styles.css">'
                '<section id="portada"><h1>Una muestra conservada</h1>'
                '<p>Se registraron 515 ejemplares.</p></section>'
                '<a href="audiencias/finagro.html#evidencia">Ficha</a>'
                '<a href="datos/resultados.json">Datos</a>'
                '<script type="module" src="scene.js"></script>'
            ).encode(),
            "audiencias/finagro.html": page(
                '<main id="evidencia"><h1>Evidencia de prueba</h1></main>'
                '<a href="../index.html#portada">Volver</a>'
            ).encode(),
            "styles.css": b"body { margin: 0; }\n",
            "scene.js": b"const count = 515;\n",
            "datos/resultados.json": b'{"count":515,"unit":"ejemplares"}\n',
        }
        for name, data in self.payload.items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        self.rows = [
            {
                "archivo": name,
                "familia": "Graph of Life",
                "fuente": "Graph of Life · test fixture",
                "condiciones": "Temporary fixture",
                "transformacion": "Test fixture only",
                "sha256": sha256(data),
                "sha256_fuente": "",
            }
            for name, data in sorted(self.payload.items())
        ]
        self.write_inventory()
        self.lock = {
            "schema": "magdalena.experience-lock/1",
            "source_commit": "1" * 40,
            "files": {name: sha256(data) for name, data in self.payload.items() if name != "README.md"},
        }
        self.write_lock()

    def write_inventory(self) -> None:
        with (self.root / "datos" / "archivos.csv").open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(self.rows)

    def write_lock(self) -> None:
        (self.root / "tools" / "experience-lock.json").write_text(
            json.dumps(self.lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    def update_fixture_hash(self, name: str, *, approve_in_fixture: bool = False) -> None:
        """Alter only this test fixture's metadata to isolate the desired guard."""
        digest = sha256((self.root / name).read_bytes())
        for row in self.rows:
            if row["archivo"] == name:
                row["sha256"] = digest
                break
        else:
            self.fail(f"Unknown fixture path: {name}")
        self.write_inventory()
        if approve_in_fixture and name != "README.md":
            self.lock["files"][name] = digest
            self.write_lock()

    def run_tool(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(self.root / "tools" / "site.py"), *map(str, args)],
            cwd=self.parent, capture_output=True, text=True, timeout=30,
        )

    def assert_pass(self, result: subprocess.CompletedProcess[str]) -> None:
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def assert_rejected(self, result: subprocess.CompletedProcess[str], *terms: str) -> None:
        combined = (result.stdout + result.stderr).lower()
        self.assertEqual(result.returncode, 1, combined)
        if terms:
            self.assertTrue(any(term.lower() in combined for term in terms), combined)

    def fixture_hashes(self) -> dict[str, str]:
        return {
            path.relative_to(self.root).as_posix(): sha256(path.read_bytes())
            for path in self.root.rglob("*") if path.is_file()
        }

    @contextlib.contextmanager
    def published_fixture(self):
        published = self.parent / "published"
        prefix = published / "magdalena-paisaje"
        for name in set(self.payload) | {"datos/archivos.csv"}:
            target = prefix / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.root / name, target)

        class QuietHandler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass

        handler = functools.partial(QuietHandler, directory=str(published))
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}/magdalena-paisaje/", prefix
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_valid_site_check_is_read_only_and_portable(self) -> None:
        before = self.fixture_hashes()
        result = self.run_tool("check")
        self.assert_pass(result)
        self.assertEqual(before, self.fixture_hashes(), "check modified its input site")

    def test_html_edit_cannot_be_approved_by_refreshing_inventory(self) -> None:
        path = self.root / "index.html"
        path.write_text(path.read_text().replace("515 ejemplares", "516 ejemplares"), encoding="utf-8")
        self.update_fixture_hash("index.html")
        self.assert_rejected(self.run_tool("check"), "lock", "approved", "aprob", "congel")

    def test_data_edit_cannot_be_approved_by_refreshing_inventory(self) -> None:
        (self.root / "datos/resultados.json").write_bytes(b'{"count":516,"unit":"ejemplares"}\n')
        self.update_fixture_hash("datos/resultados.json")
        self.assert_rejected(self.run_tool("check"), "lock", "approved", "aprob", "congel")

    def test_inventory_traversal_is_rejected(self) -> None:
        (self.parent / "outside.txt").write_bytes(b"Outside the release root.\n")
        row = dict(self.rows[0])
        row.update(archivo="../outside.txt", sha256=sha256((self.parent / "outside.txt").read_bytes()))
        self.rows.append(row)
        self.write_inventory()
        self.assert_rejected(self.run_tool("check"), "path", "ruta", "unsafe", "traversal", "relative")

    def test_duplicate_inventory_path_is_rejected(self) -> None:
        self.rows.append(dict(self.rows[0]))
        self.write_inventory()
        self.assert_rejected(self.run_tool("check"), "duplicate", "duplicad")

    def test_symlink_is_rejected_even_when_target_bytes_match(self) -> None:
        source = self.root / "datos/resultados.json"
        outside = self.parent / "outside.json"
        outside.write_bytes(source.read_bytes())
        source.unlink()
        try:
            source.symlink_to(outside)
        except OSError as exc:
            self.skipTest(f"Platform cannot create symlinks: {exc}")
        self.assert_rejected(self.run_tool("check"), "symlink", "symbolic", "simb", "outside", "escape")

    def test_stale_inventory_hash_is_rejected(self) -> None:
        (self.root / "README.md").write_text("Changed maintenance metadata.\n", encoding="utf-8")
        self.assert_rejected(self.run_tool("check"), "hash", "sha256", "digest")

    def test_missing_anchor_is_rejected_with_matching_hashes_and_lock(self) -> None:
        path = self.root / "index.html"
        path.write_text(path.read_text().replace("finagro.html#evidencia", "finagro.html#missing"), encoding="utf-8")
        self.update_fixture_hash("index.html", approve_in_fixture=True)
        self.assert_rejected(self.run_tool("check"), "anchor", "fragment", "ancla", "missing")

    def test_duplicate_html_id_is_rejected_with_matching_hashes_and_lock(self) -> None:
        path = self.root / "index.html"
        path.write_text(path.read_text().replace("</section>", '<div id="portada"></div></section>'), encoding="utf-8")
        self.update_fixture_hash("index.html", approve_in_fixture=True)
        self.assert_rejected(self.run_tool("check"), "duplicate", "duplicad")

    def test_inventory_update_changes_only_requested_hash_and_never_lock(self) -> None:
        lock_before = (self.root / "tools/experience-lock.json").read_bytes()
        before = {row["archivo"]: dict(row) for row in self.rows}
        changed = self.root / "README.md"
        changed.write_text("Updated maintenance guidance.\n", encoding="utf-8")
        self.assert_pass(self.run_tool("inventory", "--update", "README.md"))
        self.assertEqual(lock_before, (self.root / "tools/experience-lock.json").read_bytes())
        with (self.root / "datos/archivos.csv").open(encoding="utf-8", newline="") as stream:
            current = list(csv.DictReader(stream))
        for row in current:
            expected = before[row["archivo"]]
            if row["archivo"] == "README.md":
                expected["sha256"] = sha256(changed.read_bytes())
            self.assertEqual(row, expected)
        self.assert_pass(self.run_tool("check"))

    def test_receipt_cannot_overwrite_an_approved_input(self) -> None:
        before = self.fixture_hashes()
        for name in ("index.html", "tools/experience-lock.json"):
            with self.subTest(protected=name):
                result = self.run_tool("check", "--receipt", str(self.root / name))
                self.assert_rejected(result, "receipt", "output", "overwrite", "protected", "payload", "destination")
                self.assertEqual(before, self.fixture_hashes(), "receipt overwrote an input")

    def test_package_output_symlink_is_rejected_before_resolution(self) -> None:
        destination = self.parent / "untouched-directory"
        destination.mkdir()
        link = self.parent / "linked-output"
        try:
            link.symlink_to(destination, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"Platform cannot create symlinks: {exc}")
        result = self.run_tool("package", "--out", str(link))
        self.assert_rejected(result, "symlink", "symbolic", "simb", "destination", "exist")
        self.assertEqual(list(destination.iterdir()), [], "package wrote through an output symlink")
        self.assertTrue(link.is_symlink())

    def assert_generated_output_symlink_is_rejected(self, name: str) -> None:
        before = self.fixture_hashes()
        out = self.parent / "package-with-symlink"
        out.mkdir()
        outside = self.parent / "outside-output-target.txt"
        original = b"An existing file outside the package must remain intact.\n"
        outside.write_bytes(original)
        link = out / name
        try:
            link.symlink_to(outside)
        except OSError as exc:
            self.skipTest(f"Platform cannot create symlinks: {exc}")
        result = self.run_tool("package", "--out", str(out))
        self.assert_rejected(result, "symlink", "symbolic", "simb", "destination", "exist")
        self.assertEqual(outside.read_bytes(), original, "package overwrote an external symlink target")
        self.assertEqual({path.name for path in out.iterdir()}, {name}, "package mutated output before rejecting the symlink")
        self.assertTrue(link.is_symlink())
        self.assertEqual(before, self.fixture_hashes())

    def test_package_manifest_symlink_is_rejected_before_any_output_write(self) -> None:
        self.assert_generated_output_symlink_is_rejected("manifest.json")

    def test_package_receipt_symlink_is_rejected_before_any_output_write(self) -> None:
        self.assert_generated_output_symlink_is_rejected("receipt.json")

    def test_external_receipt_symlink_is_rejected_without_overwriting_target(self) -> None:
        before = self.fixture_hashes()
        outside = self.parent / "existing-document.txt"
        original = b"Existing document.\n"
        outside.write_bytes(original)
        receipt = self.parent / "linked-receipt.json"
        try:
            receipt.symlink_to(outside)
        except OSError as exc:
            self.skipTest(f"Platform cannot create symlinks: {exc}")
        result = self.run_tool("check", "--receipt", str(receipt))
        self.assert_rejected(result, "symlink", "symbolic", "simb", "destination", "exist")
        self.assertEqual(outside.read_bytes(), original)
        self.assertTrue(receipt.is_symlink())
        self.assertEqual(before, self.fixture_hashes())

    def test_invalid_site_cannot_be_packaged(self) -> None:
        (self.root / "datos/resultados.json").write_bytes(b"corrupted")
        out = self.parent / "rejected-package"
        self.assert_rejected(self.run_tool("package", "--out", str(out)))
        self.assertFalse((out / "Magdalena-Pages.zip").exists())

    def test_verify_public_checks_project_prefix_without_writing_inputs(self) -> None:
        before = self.fixture_hashes()
        with self.published_fixture() as (url, _prefix):
            self.assert_pass(self.run_tool("verify-public", "--url", url))
        self.assertEqual(before, self.fixture_hashes())

    def test_verify_public_rejects_http_200_with_wrong_payload_bytes(self) -> None:
        with self.published_fixture() as (url, prefix):
            # Emulate a host returning its HTML fallback at a successful data URL.
            (prefix / "datos/resultados.json").write_bytes((prefix / "index.html").read_bytes())
            result = self.run_tool("verify-public", "--url", url)
            self.assert_rejected(result, "hash", "sha256", "digest", "mismatch", "differ")

    def test_package_round_trip_is_deterministic_and_excludes_tooling(self) -> None:
        out_a, out_b = self.parent / "package-a", self.parent / "package-b"
        before = self.fixture_hashes()
        self.assert_pass(self.run_tool("package", "--out", str(out_a)))
        self.assert_pass(self.run_tool("package", "--out", str(out_b)))
        self.assertEqual(before, self.fixture_hashes(), "package modified its input site")
        zip_a, zip_b = out_a / "Magdalena-Pages.zip", out_b / "Magdalena-Pages.zip"
        self.assertEqual(zip_a.read_bytes(), zip_b.read_bytes())
        expected = set(self.payload) | {"datos/archivos.csv"}
        manifest = json.loads((out_a / "manifest.json").read_text(encoding="utf-8"))
        entries = {item["path"]: item for item in manifest["files"]}
        self.assertEqual(set(entries), expected)
        site_paths = {p.relative_to(out_a / "site").as_posix() for p in (out_a / "site").rglob("*") if p.is_file()}
        self.assertEqual(site_paths, expected)
        with zipfile.ZipFile(zip_a) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(set(archive.namelist()), expected)
            self.assertEqual(len(archive.namelist()), len(expected), "duplicate ZIP entries")
            for name in expected:
                data = (self.root / name).read_bytes()
                self.assertEqual(archive.read(name), data)
                self.assertEqual((out_a / "site" / name).read_bytes(), data)
                self.assertEqual(entries[name]["sha256"], sha256(data))
                self.assertEqual(entries[name]["size_bytes"], len(data))
            self.assertFalse(any(name.startswith("tools/") for name in archive.namelist()))


if __name__ == "__main__":
    unittest.main()
