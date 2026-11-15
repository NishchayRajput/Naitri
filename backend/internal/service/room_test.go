package service

import (
	"strings"
	"testing"
)

func TestNormalizeCode(t *testing.T) {
	cases := map[string]string{
		"bcd-fghj-kmn":  "bcd-fghj-kmn",
		"BCD-FGHJ-KMN":  "bcd-fghj-kmn",
		"bcdfghjkmn":    "bcd-fghj-kmn",
		"  bcdfghjkmn ": "bcd-fghj-kmn",
		"bcd fghj kmn":  "bcd-fghj-kmn",
		"bcd.fghj.kmn":  "bcd-fghj-kmn",
		// Vowels and look-alikes (0/o, 1/l/i) are not in the alphabet, so a
		// code that picked them up from OCR or a typo is cleaned rather than
		// resolving to the wrong room.
		"bcd-fghj-kmn!": "bcd-fghj-kmn",
		"bcdofghjikmn":  "bcd-fghj-kmn",
	}

	for input, want := range cases {
		if got := NormalizeCode(input); got != want {
			t.Errorf("NormalizeCode(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestGenerateCodeShape(t *testing.T) {
	seen := make(map[string]bool)

	for range 500 {
		code := generateCode()

		parts := strings.Split(code, "-")
		if len(parts) != 3 || len(parts[0]) != 3 || len(parts[1]) != 4 || len(parts[2]) != 3 {
			t.Fatalf("malformed code %q", code)
		}
		for _, r := range strings.ReplaceAll(code, "-", "") {
			if !strings.ContainsRune(codeAlphabet, r) {
				t.Fatalf("code %q contains out-of-alphabet rune %q", code, r)
			}
		}
		if seen[code] {
			t.Fatalf("duplicate code generated within 500 draws: %q", code)
		}
		seen[code] = true

		// A generated code must survive a normalize round trip, or shared
		// links would not resolve to the room they created.
		if NormalizeCode(code) != code {
			t.Fatalf("NormalizeCode(%q) = %q, not stable", code, NormalizeCode(code))
		}
	}
}
