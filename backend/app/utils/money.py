from decimal import ROUND_HALF_UP, Decimal

# Currency default precision: 2 decimal places for storage and arithmetic
TWO_PLACES = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")


def round_money(amount: Decimal | str | float, precision: Decimal = TWO_PLACES) -> Decimal:
    """
    Rounds a monetary amount using standard financial bankers/half-up rounding.
    Converts strings/floats safely through Decimal representation.
    """
    if not isinstance(amount, Decimal):
        amount = Decimal(str(amount))
    return amount.quantize(precision, rounding=ROUND_HALF_UP)
