"""Read source data and drawing bindings without modifying the workbook."""
import datetime
import hashlib
import io
import json
import posixpath
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def serialize(value):
    if isinstance(value, (datetime.date, datetime.time, datetime.timedelta)):
        return value.isoformat() if hasattr(value, "isoformat") else str(value)
    return value


def relationships(archive, part):
    base, name = posixpath.split(part)
    path = posixpath.join(base, "_rels", name + ".rels")
    if path not in archive.namelist():
        return {}
    return {
        item.attrib["Id"]: (item.attrib["Target"].lstrip("/") if item.attrib["Target"].startswith("/")
                            else posixpath.normpath(posixpath.join(base, item.attrib["Target"])))
        for item in ET.fromstring(archive.read(path))
        if item.attrib.get("TargetMode") != "External"
    }


def bindings(archive, sheet):
    result = []
    rels = relationships(archive, sheet)
    for drawing in ET.fromstring(archive.read(sheet)).findall("{*}drawing"):
        target = next((rels.get(value) for key, value in drawing.attrib.items() if key.endswith("}id")), None)
        if not target:
            continue
        images = relationships(archive, target)
        for anchor in ET.fromstring(archive.read(target)):
            start = anchor.find("{*}from")
            blip = anchor.find(".//{*}blip")
            if start is None or blip is None:
                continue
            media = next((images.get(value) for key, value in blip.attrib.items() if key.endswith("}embed")), None)
            if media is None or not media.startswith("xl/media/"):
                continue
            column = int(start.findtext("{*}col")) + 1
            row = int(start.findtext("{*}row")) + 1
            result.append({"cell": get_column_letter(column) + str(row), "media": media,
                           "sha256": sha256(archive.read(media))})
    return result


def extract_covers(archive, sheet, source_hash, directory):
    target = Path(directory)
    target.mkdir(parents=True, exist_ok=True)
    covers = []
    for row in sheet["rows"][1:]:
        cells = row["cells"]
        if not str(cells.get("A", "")).startswith("R") or not cells.get("B"):
            continue
        matches = [image for image in sheet["images"] if image["cell"] == f"AA{row['row']}"]
        if len(matches) != 1:
            continue
        image = matches[0]
        data = archive.read(image["media"])
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            suffix = "png"
        elif data.startswith(b"\xff\xd8\xff"):
            suffix = "jpg"
        elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
            suffix = "webp"
        else:
            continue
        name = f"{image['sha256']}.{suffix}"
        (target / name).write_bytes(data)
        covers.append({"sourceId": cells["A"], "name": cells["B"], "cell": image["cell"], "file": name,
                       "version": cells["C"], "prep": cells.get("U"), "cook": cells.get("V"), "portion": cells.get("Z")})
    temporary = target / "manifest.tmp"
    temporary.write_text(json.dumps({"sourceHash": source_hash, "covers": covers}, ensure_ascii=False), encoding="utf-8")
    temporary.replace(target / "manifest.json")


def main(path, cover_directory=None):
    with open(path, "rb") as handle:
        data = handle.read()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        sheet_rel = relationships(archive, "xl/workbook.xml")
        sheet_xml = ET.fromstring(archive.read("xl/workbook.xml"))
        by_name = {
            node.attrib["name"]: next(sheet_rel[value] for key, value in node.attrib.items() if key.endswith("}id"))
            for node in sheet_xml.findall(".//{*}sheet")
        }
        workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=False)
        result = []
        for sheet in workbook.worksheets:
            rows = []
            for i, values in enumerate(sheet.values, 1):
                cells = {get_column_letter(index): serialize(value)
                         for index, value in enumerate(values, 1) if value is not None}
                if cells:
                    rows.append({"row": i, "cells": cells})
            result.append({"name": sheet.title, "rows": rows, "images": bindings(archive, by_name[sheet.title])})
        workbook.close()
        source_hash = sha256(data)
        if cover_directory:
            recipe_sheet = next(sheet for sheet in result if sheet["name"] == "菜谱")
            extract_covers(archive, recipe_sheet, source_hash, cover_directory)
    if not cover_directory:
        print(json.dumps({"sourceHash": source_hash, "sheets": result}, ensure_ascii=False))


if __name__ == "__main__":
    main(*sys.argv[1:])
