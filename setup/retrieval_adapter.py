from __future__ import annotations

import re
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EvidenceItem:
    title: str
    url: str
    snippet: str

    def to_dict(self) -> dict[str, str]:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
        }


CURATED_SOURCES: dict[str, list[tuple[str, str]]] = {
    "new_delhi": [
        ("Delhi Statistical Handbook", "https://des.delhi.gov.in/"),
        ("NITI Aayog SDG Dashboard", "https://sdgindiaindex.niti.gov.in/"),
        ("Delhi Budget Documents", "https://finance.delhi.gov.in/"),
    ],
    "new_york": [
        ("NYC Open Data", "https://opendata.cityofnewyork.us/"),
        (
            "NYC Mayor's Management Report",
            "https://www.nyc.gov/site/operations/performance/mmr.page",
        ),
        ("NYC Comptroller Reports", "https://comptroller.nyc.gov/reports/"),
    ],
    "london": [
        ("Greater London Authority DataStore", "https://data.london.gov.uk/"),
        ("Office for National Statistics", "https://www.ons.gov.uk/"),
        ("Transport for London Performance", "https://tfl.gov.uk/corporate/publications-and-reports"),
    ],
    "tokyo": [
        ("Tokyo Metropolitan Government", "https://www.metro.tokyo.lg.jp/"),
        ("Statistics Bureau of Japan", "https://www.stat.go.jp/english/"),
        ("MLIT Transport Policy", "https://www.mlit.go.jp/en/"),
    ],
    "dubai": [
        ("Dubai Statistics Center", "https://www.dsc.gov.ae/"),
        ("UAE Open Data", "https://bayanat.ae/"),
        ("Dubai Economy and Tourism", "https://www.dubaided.gov.ae/"),
    ],
}


def _strip_html(html: str) -> str:
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", html)
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _fetch_snippet(url: str, max_chars: int = 420) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "city-of-agents-setup/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=8) as response:
        raw = response.read(32_000)
    decoded = raw.decode("utf-8", errors="ignore")
    text = _strip_html(decoded)
    return text[:max_chars]


def fetch_research_evidence(
    city_id: str,
    research_mode: str = "auto",
    max_items: int = 5,
) -> list[dict[str, str]]:
    """
    Return curated evidence entries for setup-time city profile generation.

    Modes:
    - provider_web: metadata-only evidence list (provider expected to use web tool natively)
    - backend_fetch: backend fetches snippets from curated URLs
    - auto: same as backend_fetch for now
    """
    normalized = research_mode.strip().lower()
    if normalized not in {"auto", "provider_web", "backend_fetch"}:
        normalized = "auto"

    sources = CURATED_SOURCES.get(city_id, [])
    evidence: list[EvidenceItem] = []

    for title, url in sources[:max_items]:
        snippet = ""
        if normalized in {"auto", "backend_fetch"}:
            try:
                snippet = _fetch_snippet(url)
            except Exception:
                snippet = ""

        if not snippet:
            snippet = (
                "Curated public source for city demographics, economy, infrastructure, "
                "governance, and social indicators."
            )

        evidence.append(EvidenceItem(title=title, url=url, snippet=snippet))

    return [item.to_dict() for item in evidence]


def city_source_titles(city_id: str) -> list[str]:
    return [title for title, _ in CURATED_SOURCES.get(city_id, [])]


def sources_payload(city_id: str) -> list[dict[str, Any]]:
    return [{"title": title, "url": url} for title, url in CURATED_SOURCES.get(city_id, [])]
