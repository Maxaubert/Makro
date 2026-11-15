"""Bring the product ids in cases.jsonl up to date with a newer products.sqlite (#35).

Ids move between database releases: a chain's label folds into the generic row, a duplicate merges
into another. The database keeps `redirects` (old id -> new id). This script follows them, keeps ids
that still exist, drops ids the database no longer has, and removes duplicates. It never adds a
product: an item whose accepted list ends up empty is reported for a person to fix.

    python -I eval/voice/refresh_ids.py --cases eval/voice/cases.jsonl --db products.sqlite [--write]

Without --write it only reports. Python standard library only.
"""
import argparse
import json
import sqlite3
import sys


def make_follow(db, exists):
    old_col, new_col = [r[1] for r in db.execute('pragma table_info(redirects)')][:2]
    redirects = dict(db.execute(f'select {old_col}, {new_col} from redirects'))

    def follow(pid):
        seen = set()
        while pid not in exists and pid not in seen:
            seen.add(pid)
            if pid not in redirects:
                return None
            pid = redirects[pid]
        return pid if pid in exists else None

    return follow


def refresh(cases, follow):
    """Returns (cases, kept, moved, dropped, emptied). Mutates the case dicts."""
    kept = moved = dropped = 0
    emptied = []
    for case in cases:
        for item in case.get('items', []):
            prods = item.get('product')
            if not isinstance(prods, list):
                continue
            new = []
            for pid in prods:
                to = follow(pid)
                if to is None:
                    dropped += 1
                    continue
                kept, moved = (kept + 1, moved) if to == pid else (kept, moved + 1)
                if to not in new:
                    new.append(to)
            if prods and not new:
                emptied.append(f"{case['id']} {item.get('name')}")
            item['product'] = new
    return cases, kept, moved, dropped, emptied


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--cases', required=True)
    ap.add_argument('--db', required=True)
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args(argv)

    db = sqlite3.connect(args.db)
    exists = {r[0] for r in db.execute('select id from products')}
    version = db.execute("select value from meta where key = 'db_version'").fetchone()
    cases = [json.loads(l) for l in open(args.cases, encoding='utf-8').read().split('\n') if l.strip()]
    cases, kept, moved, dropped, emptied = refresh(cases, make_follow(db, exists))

    print(f"db {version[0] if version else '?'}: kept {kept}, redirected {moved}, dropped {dropped}")
    if emptied:
        print(f'{len(emptied)} items lost every accepted id and need a person to pick new ones:')
        for e in emptied:
            print('  ' + e)
    if args.write:
        with open(args.cases, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(json.dumps(c, ensure_ascii=False) for c in cases) + '\n')
        print('written')
    return 0


if __name__ == '__main__':
    sys.exit(main())
