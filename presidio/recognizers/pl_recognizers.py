from presidio_analyzer import PatternRecognizer, Pattern
from typing import Optional


class PlNipRecognizer(PatternRecognizer):
    """Polish NIP (tax ID) recognizer with checksum validation."""

    PATTERNS = [
        Pattern("nip_with_dashes", r"\b\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}\b", 0.5),
        Pattern("nip_plain", r"(?<!\d)\d{10}(?!\d)", 0.4),
    ]
    CONTEXT = ["nip", "podatnik", "firma", "vat", "faktura", "nip-u", "nipu"]

    def __init__(self):
        super().__init__(
            supported_entity="PL_NIP",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
            supported_language="pl",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        digits = "".join(c for c in pattern_text if c.isdigit())
        if len(digits) != 10:
            return False
        weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
        total = sum(int(digits[i]) * weights[i] for i in range(9))
        check = total % 11
        if check == 10:
            return False
        return check == int(digits[9])


class PlPeselRecognizer(PatternRecognizer):
    """Polish PESEL recognizer with checksum and date-of-birth validation."""

    PATTERNS = [
        Pattern(
            "pesel",
            r"(?<!\d)[0-9]{2}([02468][1-9]|[13579][012])(0[1-9]|1[0-9]|2[0-9]|3[01])[0-9]{5}(?!\d)",
            0.75,
        ),
    ]
    CONTEXT = ["pesel", "peselu", "urodzenia", "tożsamość", "obywatel"]

    def __init__(self):
        super().__init__(
            supported_entity="PL_PESEL",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
            supported_language="pl",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        digits = "".join(c for c in pattern_text if c.isdigit())
        if len(digits) != 11:
            return False
        weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
        total = sum(int(digits[i]) * weights[i] for i in range(10))
        check = (10 - (total % 10)) % 10
        return check == int(digits[10])


class PlRegonRecognizer(PatternRecognizer):
    """Polish REGON (business registry) recognizer with checksum validation."""

    PATTERNS = [
        Pattern("regon_14", r"(?<!\d)\d{14}(?!\d)", 0.5),
        Pattern("regon_9", r"(?<!\d)\d{9}(?!\d)", 0.45),
    ]
    CONTEXT = ["regon", "rejestr", "gus", "przedsiębiorstwo"]

    def __init__(self):
        super().__init__(
            supported_entity="PL_REGON",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
            supported_language="pl",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        digits = "".join(c for c in pattern_text if c.isdigit())
        if len(digits) == 9:
            return self._validate_9(digits)
        if len(digits) == 14:
            return self._validate_14(digits)
        return False

    @staticmethod
    def _validate_9(digits: str) -> bool:
        weights = [8, 9, 2, 3, 4, 5, 6, 7]
        total = sum(int(digits[i]) * weights[i] for i in range(8))
        check = total % 11
        if check == 10:
            check = 0
        return check == int(digits[8])

    @staticmethod
    def _validate_14(digits: str) -> bool:
        weights = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]
        total = sum(int(digits[i]) * weights[i] for i in range(13))
        check = total % 11
        if check == 10:
            check = 0
        return check == int(digits[13])


class PlIdCardRecognizer(PatternRecognizer):
    """Polish ID card recognizer with checksum validation.

    Algorithm source: algorytm.org/numer-dowodu-osobistego/
    Check digit is at position 3 (first digit after the 3-letter series).
    Weights [7,3,1,7,3,1,7,3] apply to positions [0,1,2,4,5,6,7,8].
    """

    _LETTER_VALUES = {chr(c): c - ord('A') + 10 for c in range(ord('A'), ord('Z') + 1)}

    PATTERNS = [
        Pattern("id_card", r"\b[A-Z]{3}\d{6}\b", 0.7),
    ]
    CONTEXT = ["dowód", "dowod", "osobisty", "seria", "dokument"]

    def __init__(self):
        super().__init__(
            supported_entity="PL_ID_CARD",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
            supported_language="pl",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        text = pattern_text.replace(" ", "").upper()
        if len(text) != 9:
            return False
        try:
            vals = [self._LETTER_VALUES[c] if c.isalpha() else int(c) for c in text]
            total = (7*vals[0] + 3*vals[1] + 1*vals[2] +
                     7*vals[4] + 3*vals[5] + 1*vals[6] +
                     7*vals[7] + 3*vals[8])
            return total % 10 == vals[3]
        except (ValueError, IndexError):
            return False


class PlIbanRecognizer(PatternRecognizer):
    """Polish IBAN recognizer with MOD-97 checksum validation."""

    PATTERNS = [
        Pattern("pl_iban", r"\bPL\d{2}(\s?\d{4}){6}\b", 0.9),
    ]
    CONTEXT = ["iban", "konto", "przelew", "bank", "rachunek"]

    def __init__(self):
        super().__init__(
            supported_entity="PL_IBAN",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
            supported_language="pl",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        iban = "".join(pattern_text.split()).upper()
        if not iban.startswith("PL") or len(iban) != 28:
            return False
        # Move first 4 chars to end, convert letters to digits
        rearranged = iban[4:] + iban[:4]
        numeric = ""
        for c in rearranged:
            if c.isdigit():
                numeric += c
            elif c.isalpha():
                numeric += str(ord(c) - ord('A') + 10)
            else:
                return False
        return int(numeric) % 97 == 1
