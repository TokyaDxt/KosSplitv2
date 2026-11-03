from kossplit.money import format_rupiah_input, parse_rupiah_amount


def test_parse_editable_rupiah_formats():
    assert parse_rupiah_amount("48000") == 48_000
    assert parse_rupiah_amount("48.000") == 48_000
    assert parse_rupiah_amount("Rp 48.000,00") == 48_000
    assert parse_rupiah_amount("IDR 48.000,00") == 48_000
    assert parse_rupiah_amount("48.000,-") == 48_000


def test_format_editable_rupiah():
    assert format_rupiah_input("48000") == "48.000"
    assert format_rupiah_input("48.000", show_cents=True) == "48.000,00"
