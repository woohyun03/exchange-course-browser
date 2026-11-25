"""Export the Flask templates and queries for a browser-only team preview."""

import json
import os
from pathlib import Path
import posixpath
import shutil
import sqlite3
import sys

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent / "Exchange Student Course Browser"
SITE = ROOT / "docs"
sys.path.insert(0, str(PROJECT / "app"))

from flask import request, url_for
from app import app, COLUMN_LABELS, MAX_RESULT_ROWS
import db
import kit


def make_preview_database(path):
    with sqlite3.connect(db.DB_PATH.as_uri() + "?mode=ro", uri=True) as source:
        with sqlite3.connect(path) as target:
            source.backup(target)
            target.execute("PRAGMA secure_delete = ON")
            target.execute("""
                CREATE TEMP TABLE student_numbers AS
                SELECT studentID AS original, ROW_NUMBER() OVER (ORDER BY studentID) AS number
                FROM students
            """)
            if target.execute("""
                SELECT 1 FROM student_numbers AS a
                JOIN student_numbers AS b ON a.original = b.number
                LIMIT 1
            """).fetchone():
                raise ValueError("Sample numbers overlap with student IDs.")
            target.execute("""
                UPDATE enrollments
                SET studentID = (SELECT number FROM student_numbers WHERE original = studentID)
            """)
            target.execute("""
                UPDATE students
                SET name = printf('Sample Student %02d',
                                  (SELECT number FROM student_numbers WHERE original = studentID)),
                    studentID = (SELECT number FROM student_numbers WHERE original = studentID)
            """)
            target.execute("UPDATE teachers SET name = printf('Sample Teacher %02d', teacherID)")
            if target.execute("PRAGMA foreign_key_check").fetchone():
                raise ValueError("The preview database contains broken foreign keys.")
            target.commit()
            target.execute("VACUUM")
        target.close()
    source.close()


def export_url(endpoint, **values):
    target = url_for(endpoint, **values)
    if endpoint == "feature_page":
        target += "/"
    current_directory = request.path if request.path == "/" else request.path + "/"
    relative = posixpath.relpath(target, start=current_directory)
    return relative + "/" if target.endswith("/") else relative


def main():
    SITE.mkdir(exist_ok=True)
    static = SITE / "static"
    static.mkdir(exist_ok=True)
    shutil.copyfile(PROJECT / "app/static/style.css", static / "style.css")
    (SITE / ".nojekyll").touch()

    preview_db = SITE / ".app.db.new"
    try:
        make_preview_database(preview_db)
        os.replace(preview_db, SITE / "app.db")
    finally:
        preview_db.unlink(missing_ok=True)
    db.DB_PATH = SITE / "app.db"

    settings = kit.load_queries()
    if settings.error:
        raise ValueError(settings.error)
    app.jinja_env.globals.update(url_for=export_url, preview_mode=True)
    client = app.test_client()
    routes = [("/", SITE / "index.html")]
    routes.extend(
        (f"/feature/{number}", SITE / f"feature/{number}/index.html")
        for number in range(1, len(settings.features) + 1)
    )
    for route, filename in routes:
        response = client.get(route)
        if response.status_code != 200:
            raise RuntimeError(f"Could not render {route}: HTTP {response.status_code}")
        filename.parent.mkdir(parents=True, exist_ok=True)
        html = response.get_data(as_text=True)
        filename.write_text("\n".join(line.rstrip() for line in html.splitlines()) + "\n",
                            encoding="utf-8")

    config = {
        "queries": [feature.clean_sql for feature in settings.features],
        "columnLabels": COLUMN_LABELS,
        "limit": MAX_RESULT_ROWS,
    }
    (static / "features.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(settings.features)} features to {SITE.name}/.")


if __name__ == "__main__":
    main()
