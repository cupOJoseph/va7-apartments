#!/usr/bin/env python3
"""Build a VA-8 apartment dataset from authoritative local GIS sources.

Sources
- U.S. Census TIGERweb 119th Congressional Districts (current VA-8 boundary)
- Arlington County Master Housing Unit Database
- City of Alexandria Buildings
- Fairfax County Tax Administration parcel + legal-description tables
- Existing manually verified Falls Church City apartment list from this repo

This intentionally prefers authoritative public GIS data over scraped marketing sites.
"""
from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from shapely.geometry import Point, Polygon, MultiPolygon, shape

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'data'
BOUNDARY_PATH = DATA_DIR / 'va8-boundary.geojson'
OUT_PATH = DATA_DIR / 'apartments.json'
SOURCES_PATH = DATA_DIR / 'va8-sources.json'
OLD_APTS_PATH = DATA_DIR / 'apartments.json'

ARLINGTON_URL = 'https://arlgis.arlingtonva.us/arcgis/rest/services/Open_Data/od_MHUD_Polygons/FeatureServer/0'
ALEX_URL = 'https://services2.arcgis.com/ChYV69FhfjwkvRmy/arcgis/rest/services/Building/FeatureServer/0'
FAIRFAX_TAX_URL = 'https://services1.arcgis.com/ioennV6PpG5Xodq0/ArcGIS/rest/services/OpenData_A6/FeatureServer/1'
FAIRFAX_PARCELS_URL = 'https://services1.arcgis.com/ioennV6PpG5Xodq0/arcgis/rest/services/Parcels/FeatureServer/0'
FAIRFAX_LEGAL_URL = 'https://services1.arcgis.com/ioennV6PpG5Xodq0/ArcGIS/rest/services/OpenData_A7/FeatureServer/1'
GEOCODER_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode'

FALLS_CHURCH_MANUAL_NAMES = {
    'The Alder', 'Broad & Washington', 'Modera Falls Church', 'Pearson Square',
    '455 at Tinner Hill', 'Northgate at Falls Church', 'Merrill House Apartments',
    'West Broad', 'Winter Hill Senior Apartments', 'The Glen', 'Modera Founders Row'
}


def load_boundary() -> Polygon | MultiPolygon:
    data = json.loads(BOUNDARY_PATH.read_text())
    return shape(data['features'][0]['geometry'])


def query_all(url: str, where: str, out_fields: str = '*', return_geometry: bool = True,
              batch_size: int = 1000, extra: Optional[Dict[str, str]] = None) -> List[dict]:
    feats: List[dict] = []
    offset = 0
    while True:
        params = {
            'f': 'json',
            'where': where,
            'outFields': out_fields,
            'returnGeometry': 'true' if return_geometry else 'false',
            'outSR': '4326',
            'resultOffset': str(offset),
            'resultRecordCount': str(batch_size),
        }
        if extra:
            params.update(extra)
        full = f"{url}/query?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(full, headers={'User-Agent': 'OpenClaw VA8 apartment research'})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
        batch = data.get('features', [])
        feats.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
        time.sleep(0.1)
    return feats


def reverse_geocode(lat: float, lng: float) -> Dict[str, str]:
    params = urllib.parse.urlencode({'location': f'{lng},{lat}', 'f': 'json', 'outSR': '4326'})
    req = urllib.request.Request(f'{GEOCODER_URL}?{params}', headers={'User-Agent': 'OpenClaw VA8 apartment research'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        addr = data.get('address', {})
        return {
            'match_addr': addr.get('Match_addr', '') or addr.get('LongLabel', ''),
            'short': addr.get('ShortLabel', ''),
            'city': addr.get('City', ''),
            'postal': addr.get('Postal', ''),
            'region': addr.get('Region', ''),
            'subregion': addr.get('Subregion', ''),
            'neighborhood': addr.get('Neighborhood', ''),
        }
    except Exception:
        return {}


def geom_centroid(feature: dict) -> Tuple[float, float]:
    geom = feature.get('geometry')
    if not geom:
        raise ValueError('missing geometry')
    if 'x' in geom and 'y' in geom:
        return geom['y'], geom['x']
    if 'rings' in geom:
        poly = shape({'type': 'Polygon', 'coordinates': geom['rings']})
    elif 'paths' in geom:
        poly = shape({'type': 'LineString', 'coordinates': geom['paths'][0]})
    else:
        poly = shape(geom)
    c = poly.centroid
    return c.y, c.x


def inside(boundary, lat: float, lng: float) -> bool:
    return boundary.contains(Point(lng, lat))


def dist(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    return math.hypot(a_lat - b_lat, a_lng - b_lng)


def load_existing_names() -> List[dict]:
    if not OLD_APTS_PATH.exists():
        return []
    return json.loads(OLD_APTS_PATH.read_text())


def enrich_name(existing: List[dict], lat: float, lng: float, units: int, county: str, fallback: str) -> str:
    best = None
    best_score = 999.0
    for apt in existing:
        if apt.get('county') != county:
            continue
        if apt.get('lat') is None or apt.get('lng') is None:
            continue
        d = dist(lat, lng, float(apt['lat']), float(apt['lng']))
        if d > 0.004:
            continue
        unit_penalty = abs((apt.get('est_units') or 0) - units) / 1000.0
        score = d + unit_penalty
        if score < best_score and apt.get('name'):
            best_score = score
            best = apt['name']
    return best or fallback


def build_arlington(boundary, existing: List[dict]) -> Tuple[List[dict], dict]:
    print('Building Arlington dataset...', flush=True)
    where = "Type_Description LIKE 'Apartment%' AND Total_Units >= 20"
    feats = query_all(ARLINGTON_URL, where, out_fields='Address,Total_Units,Type_Description,Year_Built,RE_Trade_Name,Planning_Name,Property_Class')
    out = []
    print(f'  Arlington candidate buildings: {len(feats)}', flush=True)
    for idx, f in enumerate(feats):
        lat, lng = geom_centroid(f)
        if not inside(boundary, lat, lng):
            continue
        a = f['attributes']
        raw_name = (a.get('RE_Trade_Name') or '').strip() or (a.get('Address') or '').strip()
        name = enrich_name(existing, lat, lng, int(a.get('Total_Units') or 0), 'Arlington', raw_name)
        out.append({
            'name': name,
            'address': f"{(a.get('Address') or '').strip()}, Arlington, VA",
            'area': (a.get('Planning_Name') or 'Arlington').strip() or 'Arlington',
            'county': 'Arlington',
            'region': 'NoVA',
            'lat': round(lat, 6),
            'lng': round(lng, 6),
            'est_units': int(a.get('Total_Units') or 0),
            'type': 'apartment',
            'community_room': 'Unknown',
            'notes': f"Year built: {a.get('Year_Built') or 'Unknown'} | {a.get('Type_Description') or ''}".strip(' |'),
            'status': 'Not Contacted',
            'source': 'Arlington County Master Housing Unit Database',
            'verified': True,
            'in_district': True,
        })
    print(f'  Arlington: {len(out)} buildings', flush=True)
    return out, {'source': 'Arlington County Master Housing Unit Database', 'count': len(out)}


def build_alexandria(boundary, existing: List[dict]) -> Tuple[List[dict], dict]:
    print('Building Alexandria dataset...', flush=True)
    where = "BUNITS >= 20 AND (BUSE = 'Residential' OR BUSE = 'Multiple or Mixed')"
    feats = query_all(ALEX_URL, where, out_fields='BNAME,BCAMPUS,BTYPE,BUSE,BSIZE,BUNITS,STORIES,YEARBLT,COMMENTS')
    out = []
    seen = set()
    print(f'  Alexandria candidate buildings: {len(feats)}', flush=True)
    for idx, f in enumerate(feats):
        lat, lng = geom_centroid(f)
        if not inside(boundary, lat, lng):
            continue
        a = f['attributes']
        geocoded = reverse_geocode(lat, lng)
        addr = geocoded.get('match_addr', '').replace(', USA', '').replace(', United States', '')
        name_seed = (a.get('BNAME') or '').strip() or (a.get('BCAMPUS') or '').strip() or geocoded.get('short', '') or 'Alexandria apartment building'
        name = enrich_name(existing, lat, lng, int(a.get('BUNITS') or 0), 'Alexandria', name_seed)
        key = (name, round(lat, 4), round(lng, 4), int(a.get('BUNITS') or 0))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            'name': name,
            'address': addr or 'Alexandria, VA',
            'area': geocoded.get('neighborhood') or geocoded.get('city') or 'Alexandria',
            'county': 'Alexandria',
            'region': 'NoVA',
            'lat': round(lat, 6),
            'lng': round(lng, 6),
            'est_units': int(a.get('BUNITS') or 0),
            'type': 'apartment',
            'community_room': 'Unknown',
            'notes': f"Use: {a.get('BUSE') or 'Unknown'} | Stories: {a.get('STORIES') or 'Unknown'} | Year built: {a.get('YEARBLT') or 'Unknown'}",
            'status': 'Not Contacted',
            'source': 'City of Alexandria Buildings dataset',
            'verified': True,
            'in_district': True,
        })
        if len(out) % 50 == 0:
            print(f'  Alexandria in-district processed: {len(out)}', flush=True)
        time.sleep(0.02)
    print(f'  Alexandria: {len(out)} buildings', flush=True)
    return out, {'source': 'City of Alexandria Buildings dataset', 'count': len(out)}


def batch_where(field: str, values: Iterable[str]) -> str:
    vals = [v.replace("'", "''") for v in values]
    return ' OR '.join(f"{field}='{v}'" for v in vals)


def build_fairfax(boundary, existing: List[dict]) -> Tuple[List[dict], dict]:
    print('Building Fairfax dataset...', flush=True)
    where = "LIVUNIT >= 20 AND (LUC_DESC LIKE '%apartment%' OR LUC_DESC LIKE '%high rise%' OR LUC_DESC LIKE '%medium rise%' OR LUC_DESC LIKE '%townhouse in rental%' OR LUC_DESC LIKE '%cooperative%')"
    tax_feats = query_all(FAIRFAX_TAX_URL, where, out_fields='PARID,LIVUNIT,LOCATION_DESC,LUC_DESC,ZONING_DESC', return_geometry=False)
    parids = sorted({(f['attributes'].get('PARID') or '').strip() for f in tax_feats if (f['attributes'].get('PARID') or '').strip()})
    print(f'  Fairfax candidate parcels: {len(parids)}', flush=True)
    tax_map = {f['attributes']['PARID'].strip(): f['attributes'] for f in tax_feats if (f['attributes'].get('PARID') or '').strip()}

    parcels = {}
    legal = {}
    chunk = 25
    for i in range(0, len(parids), chunk):
        batch = parids[i:i+chunk]
        if i % 100 == 0:
            print(f'  Fairfax join batch {i//chunk + 1}/{(len(parids)+chunk-1)//chunk}', flush=True)
        p_where = batch_where('PIN', batch)
        for f in query_all(FAIRFAX_PARCELS_URL, p_where, out_fields='PIN', batch_size=100, extra={'returnCentroid': 'false'}):
            pin = (f['attributes'].get('PIN') or '').strip()
            if pin:
                parcels[pin] = f
        l_where = batch_where('PARID', batch)
        for f in query_all(FAIRFAX_LEGAL_URL, l_where, out_fields='PARID,ADRNO,ADRADD,ADRDIR,ADRSTR,ADRSUF,ADRSUF2,CITYNAME,ZIP1,LEGAL1', return_geometry=False, batch_size=100):
            pid = (f['attributes'].get('PARID') or '').strip()
            if pid:
                legal[pid] = f['attributes']
        time.sleep(0.05)

    out = []
    for parid in parids:
        pf = parcels.get(parid)
        if not pf:
            continue
        lat, lng = geom_centroid(pf)
        if not inside(boundary, lat, lng):
            continue
        t = tax_map[parid]
        l = legal.get(parid, {})
        street_parts = [l.get('ADRNO'), l.get('ADRADD'), l.get('ADRDIR'), l.get('ADRSTR'), l.get('ADRSUF'), l.get('ADRSUF2')]
        street = ' '.join(str(p).strip() for p in street_parts if p not in (None, '', 0)).strip()
        city = (l.get('CITYNAME') or 'Fairfax County').strip()
        zip1 = (l.get('ZIP1') or '').strip()
        addr = f"{street}, {city}, VA {zip1}".strip().rstrip(',') if street else f"{city}, VA {zip1}".strip()
        luc = (t.get('LUC_DESC') or '').lower()
        if 'high rise' in luc:
            typ = 'high-rise'
        elif 'medium rise' in luc:
            typ = 'mid-rise'
        elif 'townhouse' in luc:
            typ = 'townhouse'
        elif 'cooperative' in luc:
            typ = 'cooperative'
        else:
            typ = 'garden'
        fallback = f"{street or parid} ({typ})"
        name = enrich_name(existing, lat, lng, int(t.get('LIVUNIT') or 0), 'Fairfax', fallback)
        out.append({
            'name': name,
            'address': addr,
            'area': city,
            'county': 'Fairfax',
            'region': 'NoVA',
            'lat': round(lat, 6),
            'lng': round(lng, 6),
            'est_units': int(t.get('LIVUNIT') or 0),
            'type': typ,
            'community_room': 'Unknown',
            'notes': f"LUC: {t.get('LUC_DESC') or 'Unknown'} | Zoning: {t.get('ZONING_DESC') or 'Unknown'}",
            'status': 'Not Contacted',
            'source': f"Fairfax County Tax Administration GIS (PARID: {parid})",
            'verified': True,
            'in_district': True,
        })
    print(f'  Fairfax: {len(out)} buildings', flush=True)
    return out, {'source': 'Fairfax County Tax Administration parcel + legal-description data', 'count': len(out)}


def build_falls_church(existing: List[dict], boundary) -> Tuple[List[dict], dict]:
    print('Building Falls Church City dataset...', flush=True)
    if not existing:
        return [], {'source': 'Existing manually verified Falls Church City apartment list', 'count': 0}
    out = []
    for apt in existing:
        if apt.get('county') != 'Falls Church City':
            continue
        if apt.get('name') not in FALLS_CHURCH_MANUAL_NAMES:
            continue
        lat = float(apt['lat'])
        lng = float(apt['lng'])
        if not inside(boundary, lat, lng):
            continue
        out.append({**apt, 'county': 'Falls Church City', 'in_district': True, 'verified': True})
    print(f'  Falls Church City: {len(out)} buildings', flush=True)
    return out, {'source': 'Existing manually verified Falls Church City apartment list', 'count': len(out)}


def dedupe(apts: List[dict]) -> List[dict]:
    deduped = []
    seen = set()
    for apt in sorted(apts, key=lambda a: (-int(a.get('est_units') or 0), a.get('county', ''), a.get('name', ''))):
        key = (
            apt.get('county'),
            (apt.get('name') or '').strip().lower(),
            round(float(apt.get('lat') or 0), 4),
            round(float(apt.get('lng') or 0), 4),
            int(apt.get('est_units') or 0),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(apt)
    return deduped


def main() -> None:
    boundary = load_boundary()
    existing = load_existing_names()
    arl, arl_meta = build_arlington(boundary, existing)
    alex, alex_meta = build_alexandria(boundary, existing)
    ffx, ffx_meta = build_fairfax(boundary, existing)
    fc, fc_meta = build_falls_church(existing, boundary)
    apartments = dedupe(arl + alex + ffx + fc)
    OUT_PATH.write_text(json.dumps(apartments, indent=2))
    SOURCES_PATH.write_text(json.dumps({
        'district': 'Virginia 8th Congressional District (current)',
        'sources': [arl_meta, alex_meta, ffx_meta, fc_meta],
        'total_apartments': len(apartments),
        'total_units': sum(int(a.get('est_units') or 0) for a in apartments),
    }, indent=2))
    print(json.dumps({
        'count': len(apartments),
        'units': sum(int(a.get('est_units') or 0) for a in apartments),
        'by_county': {
            county: sum(1 for a in apartments if a['county'] == county)
            for county in sorted({a['county'] for a in apartments})
        }
    }, indent=2))


if __name__ == '__main__':
    main()
