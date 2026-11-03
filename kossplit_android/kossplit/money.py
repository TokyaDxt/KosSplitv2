from __future__ import annotations

import re
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP


def rupiah(value: int) -> str:
    """Indonesian Rupiah with dot separators; negatives read '-Rp100.000'."""
    number = int(value)
    sign = "-" if number < 0 else ""
    return f"{sign}Rp{abs(number):,}".replace(",", ".")


def parse_rupiah_amount(text: str) -> int:
    """Parse editable/OCR Rupiah text into an integer.

    Supports ``48.000``, ``IDR 48.000,00``, ``Rp48.000,-``, and plain digits.
    A non-zero cent value is rounded to the nearest Rupiah.
    """

    cleaned = re.sub(r"(?i)\b(?:rp|idr)\.?\s*", "", text)
    cleaned = re.sub(r"\s+", "", cleaned).strip("()").lstrip("-")
    cleaned = re.sub(r",?-$", "", cleaned)
    if not cleaned:
        return 0
    if not re.fullmatch(r"\d[\d.,]*", cleaned):
        raise ValueError(f"Nominal tidak dikenali: {text}")

    decimal = re.search(r"[,.](\d{2})$", cleaned)
    if decimal:
        whole = re.sub(r"[.,]", "", cleaned[:-3])
        if not whole:
            raise ValueError(f"Nominal tidak dikenali: {text}")
        value = Decimal(f"{whole}.{decimal.group(1)}")
        return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))

    return int(re.sub(r"[.,]", "", cleaned))


def format_rupiah_input(text: str, show_cents: bool = False) -> str:
    """Format an editable value using Indonesian thousands and decimal marks."""

    if not text.strip():
        return ""
    formatted = f"{parse_rupiah_amount(text):,}".replace(",", ".")
    return f"{formatted},00" if show_cents else formatted


def allocate_weighted(total: int, weights: dict[int, Decimal]) -> dict[int, int]:
    """Allocate every rupiah deterministically with largest remainders."""
    if total < 0:
        raise ValueError("Total tidak boleh negatif")
    if not weights or any(weight < 0 for weight in weights.values()):
        raise ValueError("Bobot pembagian tidak valid")
    weight_total = sum(weights.values(), Decimal(0))
    if weight_total <= 0:
        raise ValueError("Total bobot harus lebih dari nol")

    exact = {
        key: Decimal(total) * weight / weight_total for key, weight in weights.items()
    }
    result = {
        key: int(value.to_integral_value(rounding=ROUND_FLOOR))
        for key, value in exact.items()
    }
    remainder = total - sum(result.values())
    order = sorted(
        exact,
        key=lambda key: (exact[key] - Decimal(result[key]), -key),
        reverse=True,
    )
    for key in order[:remainder]:
        result[key] += 1
    return result
