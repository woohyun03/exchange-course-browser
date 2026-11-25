# Exchange Student Course Browser

The site in `docs/` is ready to serve with GitHub Pages. It runs the 11 course
queries in the browser with SQLite and includes a sample database with generic
student and teacher names. Opening the Pages URL requires no local installation.

To publish this preview, choose the repository that will host it. In **Settings → Pages**,
use **Deploy from a branch**, select `main` and `/docs`, then save. Push the generated
files after each export.

To refresh the pages from the separate Flask coursework project, rebuild its
database first if the data changed. Then, from this folder, run:

```sh
"../Exchange Student Course Browser/.venv/bin/python" export_preview.py
```

This preview uses sql.js 1.17.0 under the MIT license included in `docs/static/`.
