#!/usr/bin/env python3
"""Validate, package and verify the static Magdalena experience with Python's stdlib."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
INVENTORY = "datos/archivos.csv"
LOCK = "tools/experience-lock.json"
COLUMNS = ["archivo", "familia", "fuente", "condiciones", "transformacion", "sha256", "sha256_fuente"]
SIGNATURE = "Story by Jay Gutiérrez, Graph of Life"
NON_PAYLOAD = {".git", ".github", ".venv", "__pycache__", "node_modules", "tools", "tests", "docs", "dist", "privado", "privados", "borradores", "recibos"}
CSS_URL = re.compile(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s)]*))\s*\)", re.IGNORECASE)
SHA_PATTERN = re.compile(r"[0-9a-f]{64}\Z")
LIMITS = [
    "Static checks do not establish rendered alignment, keyboard usability, mobile quality or scientific validity; browser review is separate.",
    "External URLs are inventoried, not fetched by check or package. Only verify-public performs HTTP requests.",
    "HTML href/src, HTML anchors and CSS url() references are checked; runtime JavaScript resource discovery and srcset are not inferred.",
    "Source-input SHA fields are format-checked and preserved; original source archives are not acquired or recomputed.",
    "Brandlint is a separate release gate; this tool does not substitute for the Graph of Life brand validator.",
]


class ValidationError(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_bytes(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def relative_name(name: str, *, payload: bool = True) -> str:
    require(isinstance(name, str) and bool(name), "Empty or invalid file path")
    require("\\" not in name and ":" not in name and "\x00" not in name, f"Unsafe path: {name!r}")
    parts = name.split("/")
    require(not name.startswith("/") and all(part not in ("", ".", "..") for part in parts), f"Noncanonical or escaping path: {name!r}")
    if payload:
        require(not any(part in NON_PAYLOAD for part in parts), f"Non-public tooling or private path in inventory: {name}")
        require(all(not part.startswith(".") or name == ".nojekyll" for part in parts), f"Hidden path in public inventory: {name}")
    return name


def source_file(name: str, *, payload: bool = True) -> Path:
    relative_name(name, payload=payload)
    path = ROOT
    for part in name.split("/"):
        path = path / part
        require(not path.is_symlink(), f"Symlink is not admissible: {name}")
    require(path.is_file(), f"Missing regular file: {name}")
    require(path.resolve().is_relative_to(ROOT), f"Path escapes repository: {name}")
    return path


def read_inventory():
    raw = source_file(INVENTORY).read_bytes()
    try:
        text = raw.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        require(reader.fieldnames == COLUMNS, f"Inventory columns must be exactly {COLUMNS}")
        rows = list(reader)
    except (UnicodeError, csv.Error) as error:
        raise ValidationError(f"Invalid inventory CSV: {error}") from error
    names = []
    for index, row in enumerate(rows, 2):
        require(set(row) == set(COLUMNS) and all(isinstance(value, str) for value in row.values()), f"Malformed inventory row {index}")
        name = relative_name(row["archivo"])
        require(name != INVENTORY, "Inventory must not contain its own recursive hash")
        require(bool(SHA_PATTERN.fullmatch(row["sha256"])), f"Invalid SHA-256 for {name}")
        require(not row["sha256_fuente"] or bool(SHA_PATTERN.fullmatch(row["sha256_fuente"])), f"Invalid source SHA-256 for {name}")
        names.append(name)
    require(len(names) == len(set(names)), "Duplicate inventory file paths")
    require("index.html" in names and ".nojekyll" in names, "Inventory must include index.html and .nojekyll")
    return raw, rows


def read_json(data: bytes, name: str):
    try:
        return json.loads(data.decode("utf-8"), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Non-finite JSON constant {value}")))
    except (UnicodeError, ValueError) as error:
        raise ValidationError(f"Invalid JSON in {name}: {error}") from error


class Page(HTMLParser):
    def __init__(self, text: str):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.duplicate_ids = set()
        self.links = []
        self.visible = []
        self.inline_css = []
        self.skip = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if attributes.get("id"):
            value = attributes["id"]
            if value in self.ids:
                self.duplicate_ids.add(value)
            self.ids.add(value)
        if tag == "a" and attributes.get("name"):
            self.ids.add(attributes["name"])
        for attribute in ("href", "src"):
            if attribute in attributes:
                self.links.append((f"html:{tag}:{attribute}", attributes[attribute]))
        if attributes.get("style"):
            self.inline_css.append(attributes["style"])
        if tag in ("script", "style"):
            self.skip = tag

    def handle_endtag(self, tag):
        if self.skip == tag:
            self.skip = None

    def handle_data(self, text):
        if self.skip == "style":
            self.inline_css.append(text)
        elif self.skip is None and text.strip():
            self.visible.append(text.strip())


def local_reference(source: str, url: str):
    require(isinstance(url, str), f"Empty URL attribute in {source}")
    try:
        parts = urlsplit(url)
    except ValueError as error:
        raise ValidationError(f"Malformed URL in {source}: {url}") from error
    if parts.scheme or parts.netloc:
        return None
    path = unquote(parts.path)
    require(not path.startswith("/"), f"Root-relative URL breaks Pages subpath portability: {source}: {url}")
    require("\\" not in path and "\x00" not in path, f"Unsafe URL path: {source}: {url}")
    normalized = list(PurePosixPath(source).parent.parts) if path else []
    if not path:
        normalized = list(PurePosixPath(source).parts)
    else:
        for part in path.split("/"):
            if part in ("", "."):
                continue
            if part == "..":
                require(bool(normalized), f"URL escapes publication root: {source}: {url}")
                normalized.pop()
            else:
                normalized.append(part)
        if path.endswith("/"):
            normalized.append("index.html")
    return "/".join(normalized), unquote(parts.fragment)


def validate(*, require_node: bool = False):
    raw, rows = read_inventory()
    snapshot = {row["archivo"]: source_file(row["archivo"]).read_bytes() for row in rows}
    snapshot[INVENTORY] = raw
    for row in rows:
        require(digest(snapshot[row["archivo"]]) == row["sha256"], f"Inventory hash mismatch: {row['archivo']}")

    lock = read_json(source_file(LOCK, payload=False).read_bytes(), LOCK)
    require(isinstance(lock, dict) and lock.get("schema") == "magdalena.experience-lock/1", "Missing or unsupported experience-lock schema")
    require(isinstance(lock.get("source_commit"), str) and re.fullmatch(r"[0-9a-f]{40}", lock["source_commit"]) is not None, "Experience lock requires a full source_commit SHA")
    locked = lock.get("files")
    require(isinstance(locked, dict), "Experience lock files must be a path-to-SHA object")
    expected_locked = set(snapshot) - {INVENTORY, "README.md"}
    require(set(locked) == expected_locked, "Experience lock file set differs from public experience inventory (README.md and inventory excluded)")
    for name, expected in locked.items():
        relative_name(name)
        require(isinstance(expected, str) and bool(SHA_PATTERN.fullmatch(expected)), f"Invalid experience-lock SHA for {name}")
        require(digest(snapshot[name]) == expected, f"Experience lock hash mismatch: {name}")

    pages = {}
    json_count = 0
    for name, data in snapshot.items():
        if name.endswith(".json"):
            read_json(data, name)
            json_count += 1
        if name.endswith(".html"):
            try:
                page = Page(data.decode("utf-8"))
            except (UnicodeError, ValueError) as error:
                raise ValidationError(f"Invalid HTML encoding/parser input: {name}: {error}") from error
            require(not page.duplicate_ids, f"Duplicate HTML IDs in {name}: {sorted(page.duplicate_ids)}")
            require(SIGNATURE in re.sub(r"\s+", " ", " ".join(page.visible)), f"Missing exact author signature in {name}")
            pages[name] = page
    references, anchors, external, other_fragments = [], [], [], []

    def check_url(source, url, kind):
        target = local_reference(source, url)
        if target is None:
            external.append({"source": source, "url": url, "kind": kind})
            return
        name, fragment = target
        require(name in snapshot, f"Missing packaged reference: {source}: {url} -> {name}")
        references.append({"source": source, "url": url, "target": name, "kind": kind})
        if fragment and name in pages:
            require(fragment in pages[name].ids, f"Missing HTML anchor: {source}: {url}")
            anchors.append({"source": source, "target": name, "anchor": fragment})
        elif fragment:
            other_fragments.append({"source": source, "url": url})

    def check_css(name, css):
        for match in CSS_URL.finditer(css):
            check_url(name, next(value for value in match.groups() if value is not None), "css:url")

    for name, page in pages.items():
        for kind, url in page.links:
            check_url(name, url, kind)
        for css in page.inline_css:
            check_css(name, css)
    for name, data in snapshot.items():
        if name.endswith(".css"):
            check_css(name, data.decode("utf-8"))

    node = shutil.which("node")
    warnings, syntax = [], []
    require(node is not None or not require_node, "Node is required for JavaScript syntax checking but was not found")
    if node is None:
        warnings.append("Node unavailable; JavaScript syntax check skipped. Use --require-node in CI.")
    else:
        for name in snapshot:
            if name.endswith((".js", ".mjs")):
                result = subprocess.run([node, "--check", str(source_file(name))], capture_output=True, text=True, timeout=60)
                require(result.returncode == 0, f"JavaScript syntax failure in {name}: {result.stderr.replace(str(ROOT), '.').strip()}")
                syntax.append(name)
    files = [{"path": name, "sha256": digest(snapshot[name]), "size_bytes": len(snapshot[name])} for name in sorted(snapshot)]
    report = {
        "schema": "magdalena.static-check/1", "status": "PASS", "checked_at_utc": stamp(),
        "experience_source_commit": lock["source_commit"],
        "summary": {"files": len(snapshot), "locked_files": len(locked), "html_pages": len(pages), "json_files": json_count, "local_references": len(references), "html_anchors": len(anchors), "javascript_syntax_files": len(syntax)},
        "files": files, "local_references": references, "html_anchors": anchors,
        "external_urls_not_checked": external, "non_html_fragments_not_checked": other_fragments,
        "warnings": warnings, "limits": LIMITS,
    }
    return snapshot, report


def write_json(path: Path, value) -> None:
    path = path.expanduser()
    require(not path.is_symlink(), "JSON output must not be a symlink")
    require(not path.exists() or path.is_file(), "JSON output must be a regular file")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix=".json-", dir=path.parent, delete=False) as handle:
        pending = Path(handle.name)
        handle.write(json_bytes(value))
    try:
        pending.chmod(0o644)
        require(not path.is_symlink(), "JSON output became a symlink during writing")
        # Replacing the directory entry never follows a final-component symlink,
        # including one introduced after the last check.
        pending.replace(path)
    finally:
        pending.unlink(missing_ok=True)


def validate_receipt_destination(path: Path) -> None:
    require(not path.expanduser().is_symlink(), "Receipt destination must not be a symlink")
    destination = path.expanduser().resolve()
    if destination.is_relative_to(ROOT):
        parts = destination.relative_to(ROOT).parts
        require(len(parts) >= 2 and parts[0] in {"dist", "recibos"}, "Receipt must be outside the repository or inside dist/ or recibos/; refusing to overwrite source or lock files")


def package(out: Path, *, require_node: bool = False):
    snapshot, check = validate(require_node=require_node)
    out = out.expanduser()
    require(not out.is_symlink(), "Package output must not be a symlink")
    out = out.resolve()
    require(out != ROOT and not ROOT.is_relative_to(out), "Package output must not contain the repository root")
    for name in snapshot:
        require(not (ROOT / name).is_relative_to(out), "Package output must not contain a public source file")
    site, archive, manifest_path = out / "site", out / "Magdalena-Pages.zip", out / "manifest.json"
    receipt_path = out / "receipt.json"
    # Validate every generated destination before mkdir, staging or replacement.
    # exists() alone misses dangling symlinks.
    for destination in (site, archive, manifest_path, receipt_path):
        require(not destination.is_symlink(), f"Package output must not be a symlink: {destination.name}")
        if destination.exists():
            require(destination.is_dir() if destination == site else destination.is_file(), f"Unexpected package output type: {destination.name}")
    if site.exists():
        require(site.is_dir() and not site.is_symlink(), "Existing package site is not a regular directory")
        require(manifest_path.is_file(), "Refusing to replace an existing site without this tool's manifest")
        previous = read_json(manifest_path.read_bytes(), "previous package manifest")
        require(previous.get("schema") == "magdalena.static-package/1", "Existing package manifest is not recognized")
        old_names = {row["path"] for row in previous.get("files", [])}
        existing = list(site.rglob("*"))
        require(not any(path.is_symlink() for path in existing), "Existing package contains symlinks")
        require({path.relative_to(site).as_posix() for path in existing if path.is_file()} == old_names, "Existing package site contains files outside its manifest")
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".package-", dir=out) as temporary:
        stage = Path(temporary)
        staged_site, staged_zip = stage / "site", stage / "Magdalena-Pages.zip"
        staged_site.mkdir()
        with zipfile.ZipFile(staged_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as stream:
            for name in sorted(snapshot):
                target = staged_site / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(snapshot[name])
                entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                stream.writestr(entry, snapshot[name])
        with zipfile.ZipFile(staged_zip) as stream:
            require(stream.namelist() == sorted(snapshot), "ZIP file set mismatch")
            require(stream.testzip() is None, "ZIP CRC check failed")
            require(all(stream.read(name) == data for name, data in snapshot.items()), "ZIP roundtrip byte mismatch")
        require(all((staged_site / name).read_bytes() == data for name, data in snapshot.items()), "Staged site byte mismatch")
        require(all(source_file(name).read_bytes() == data for name, data in snapshot.items()), "Source changed while packaging; rerun against the final edition")
        manifest = {"schema": "magdalena.static-package/1", "experience_source_commit": check["experience_source_commit"], "files": check["files"], "zip": {"path": archive.name, "sha256": digest(staged_zip.read_bytes()), "size_bytes": staged_zip.stat().st_size}, "site": "site", "zip_timestamp": "1980-01-01T00:00:00"}
        if site.exists():
            site.replace(stage / "previous-site")
        staged_site.replace(site)
        staged_zip.replace(archive)
        write_json(manifest_path, manifest)
    receipt = {"schema": "magdalena.package-receipt/1", "status": "PASS", "checked_at_utc": stamp(), "summary": check["summary"], "zip": manifest["zip"], "roundtrip_identity": True, "payload_file_set_exact": True, "warnings": check["warnings"], "limits": LIMITS}
    write_json(receipt_path, receipt)
    return receipt


def update_inventory(names):
    raw, rows = read_inventory()
    require(len(names) == len(set(names)), "Duplicate requested inventory update paths")
    by_name = {row["archivo"]: row for row in rows}
    changes = []
    for name in names:
        relative_name(name)
        require(name in by_name, f"Inventory update can only refresh an existing row: {name}")
        value = digest(source_file(name).read_bytes())
        old = by_name[name]["sha256"]
        if value != old:
            by_name[name]["sha256"] = value
            changes.append({"path": name, "before_sha256": old, "sha256": value})
    if changes:
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=COLUMNS, lineterminator="\r\n" if b"\r\n" in raw else "\n")
        writer.writeheader()
        writer.writerows(rows)
        target = source_file(INVENTORY)
        require(target.read_bytes() == raw, "Inventory changed during update")
        with tempfile.NamedTemporaryFile(prefix=".inventory-", dir=target.parent, delete=False) as handle:
            pending = Path(handle.name)
            handle.write(stream.getvalue().encode("utf-8"))
        try:
            pending.chmod(target.stat().st_mode & 0o777)
            pending.replace(target)
        finally:
            pending.unlink(missing_ok=True)
    return {"schema": "magdalena.inventory-update/1", "status": "PASS", "changed_rows": changes, "experience_lock_modified": False, "note": "Only hashes of existing inventory rows were refreshed. The experience lock must still pass independently."}


def verify_public(url: str, *, require_node: bool = False):
    parsed = urlsplit(url)
    require(parsed.scheme in ("http", "https") and bool(parsed.netloc) and not parsed.query and not parsed.fragment and parsed.username is None, "Public URL must be HTTP(S), without credentials, query or fragment")
    base = url.rstrip("/") + "/"
    snapshot, check = validate(require_node=require_node)
    identity = digest(json_bytes(check["files"]))

    def fetch(item):
        name, address = item
        attempts = []
        for number in range(3):
            attempt = {"attempt": number + 1, "url": address, "checked_at_utc": stamp()}
            try:
                request = Request(address, headers={"User-Agent": "Magdalena-static-verifier/1", "Cache-Control": "no-cache"})
                with urlopen(request, timeout=30) as response:
                    content = response.read()
                    attempt.update({"status": response.status, "final_url": response.url, "sha256": digest(content), "size_bytes": len(content), "matches": response.status == 200 and content == snapshot[name]})
            except HTTPError as error:
                attempt.update({"status": error.code, "matches": False, "error": str(error)})
            except Exception as error:
                attempt.update({"status": None, "matches": False, "error": str(error)})
            attempts.append(attempt)
            if attempt["matches"]:
                break
            if number < 2:
                time.sleep(2 * (number + 1))
        return {"path": name, "expected_sha256": digest(snapshot[name]), "expected_size_bytes": len(snapshot[name]), "status": "PASS" if attempts[-1]["matches"] else "FAIL", "attempts": attempts}

    items = [(name, base + quote(name, safe="/") + "?release=" + identity) for name in sorted(snapshot)]
    with ThreadPoolExecutor(max_workers=4) as workers:
        files = list(workers.map(fetch, items))
    homepage = fetch(("index.html", base))
    unchanged = all(source_file(name).read_bytes() == data for name, data in snapshot.items())
    passed = all(item["status"] == "PASS" for item in files) and homepage["status"] == "PASS" and unchanged
    return {"schema": "magdalena.public-verification/1", "status": "PASS" if passed else "FAIL", "checked_at_utc": stamp(), "base_url": base, "unauthenticated_gets": True, "workers": 4, "expected_files": len(snapshot), "passed_files": sum(item["status"] == "PASS" for item in files), "files": files, "homepage_without_query": homepage, "source_unchanged": unchanged, "limits": ["HTTP byte identity is checked against the current inventory and lock. Hosting build status is not queried.", "Visual and interactive browser acceptance is separate; this command does not modify local or remote site files."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    check_parser = commands.add_parser("check", help="Validate the public inventory, experience lock and static references")
    check_parser.add_argument("--receipt", type=Path)
    check_parser.add_argument("--require-node", action="store_true")
    package_parser = commands.add_parser("package", help="Write the validated static site, deterministic ZIP and manifest")
    package_parser.add_argument("--out", type=Path, default=ROOT / "dist")
    package_parser.add_argument("--require-node", action="store_true")
    inventory_parser = commands.add_parser("inventory", help="Refresh only SHA fields in existing inventory rows")
    inventory_parser.add_argument("--update", nargs="+", required=True, metavar="PATH")
    public_parser = commands.add_parser("verify-public", help="Compare public HTTP bytes with the validated local payload")
    public_parser.add_argument("--url", required=True)
    public_parser.add_argument("--receipt", type=Path)
    public_parser.add_argument("--require-node", action="store_true")
    args = parser.parse_args()
    receipt = getattr(args, "receipt", None)
    receipt_allowed = False
    try:
        if receipt is not None:
            validate_receipt_destination(receipt)
            receipt_allowed = True
        if args.command == "check":
            _, result = validate(require_node=args.require_node)
        elif args.command == "package":
            result = package(args.out, require_node=args.require_node)
        elif args.command == "inventory":
            result = update_inventory(args.update)
        else:
            result = verify_public(args.url, require_node=args.require_node)
    except (ValidationError, OSError, UnicodeError, subprocess.SubprocessError, ValueError, KeyError, TypeError) as error:
        result = {"schema": "magdalena.tool-failure/1", "status": "FAIL", "command": args.command, "error": str(error).replace(str(ROOT), ".")}
    if receipt is not None and receipt_allowed:
        try:
            write_json(receipt, result)
        except (OSError, ValidationError) as error:
            result = {"status": "FAIL", "command": args.command, "error": f"Unable to write receipt: {error}"}
    if args.command in ("check", "verify-public") and result.get("status") == "PASS":
        printed = {key: value for key, value in result.items() if key not in ("files", "local_references", "html_anchors", "external_urls_not_checked", "non_html_fragments_not_checked")}
    else:
        printed = result
    print(json.dumps(printed, ensure_ascii=False, indent=2))
    return 0 if result.get("status") == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
