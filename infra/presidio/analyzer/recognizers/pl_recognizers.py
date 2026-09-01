import os
import re
import threading
from presidio_analyzer import PatternRecognizer, Pattern, RecognizerResult
from typing import List, Optional


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


class PlPersonRecognizer(PatternRecognizer):
    """Polish full-name recognizer backed by the official PESEL name registry.

    Matches two-word capitalized pairs (First Last) and validates them
    against word lists extracted from dane.gov.pl PESEL datasets:
      - data/first_names.txt  — 36K unique Polish first names (UPPERCASE)
      - data/last_names.txt   — 598K unique Polish surnames  (UPPERCASE)

    A match is accepted when:
      word1 ∈ first_names AND word2 ∈ last_names
      OR word1 ∈ last_names AND word2 ∈ first_names  (odwrócona kolejność)

    This eliminates the need for context gating — "Dyrektor Finansowy",
    "Ragen Store", "Project Manager" simply do not appear in the registry.

    Data files are loaded once at import time from the same directory as
    this module (RECOGNIZERS_PATH). Gracefully degrades to spaCy NER only
    if the files are absent.
    """

    _NAME_PATTERN = (
        r"\b([A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćąśęłóń]{1,20})"
        r"[ \t]+"
        r"([A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćąśęłóń]{1,30})\b"
    )

    PATTERNS = [Pattern("person_name_pair", _NAME_PATTERN, 0.5)]
    CONTEXT = ["imię", "nazwisko", "pan", "pani", "pracownik", "autor",
               "zleceniobiorca", "zleceniodawca", "wykonawca",
               "podpisał", "podpisała", "sporządził", "sporządziła"]

    _first_names: Optional[frozenset] = None
    _last_names: Optional[frozenset] = None
    _data_loaded: bool = False
    _data_lock: threading.Lock = threading.Lock()

    @classmethod
    def _load_data(cls) -> None:
        if cls._data_loaded:
            return
        with cls._data_lock:
            if cls._data_loaded:
                return
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            first_path = os.path.join(data_dir, "first_names.txt")
            last_path = os.path.join(data_dir, "last_names.txt")
            try:
                with open(first_path, encoding="utf-8") as f:
                    cls._first_names = frozenset(n.strip() for n in f if n.strip())
                with open(last_path, encoding="utf-8") as f:
                    cls._last_names = frozenset(n.strip() for n in f if n.strip())
            except FileNotFoundError:
                cls._first_names = None
                cls._last_names = None
            finally:
                cls._data_loaded = True

    def __init__(self):
        self._load_data()
        super().__init__(
            supported_entity="PERSON",
            patterns=self.PATTERNS,
            context=self.CONTEXT,
            supported_language="pl",
        )

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        parts = pattern_text.split()
        if len(parts) != 2:
            return False
        first, last = parts

        # Basic structural checks
        if not first[0].isupper() or not last[0].isupper():
            return False
        if first.isupper() or last.isupper():
            return False
        if len(first) < 2 or len(last) < 2:
            return False

        # If registry data is unavailable, fall back to spaCy NER (return None)
        if self._first_names is None or self._last_names is None:
            return None

        first_up = first.upper()
        last_up = last.upper()

        # Accept: first name + surname OR surname + first name
        if (first_up in self._first_names and last_up in self._last_names) or \
           (first_up in self._last_names and last_up in self._first_names):
            return True

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
