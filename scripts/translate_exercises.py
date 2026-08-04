#!/usr/bin/env python3
"""Generate Spanish names for the exercise catalog (data/ejercicios-es.json).

The dataset's `nombre` field was never translated (only the instructions
were). This script classifies each English name into slots (movement,
equipment, stance, grip/side, body part, misc modifiers) and recomposes a
natural-reading Spanish name, then writes the result back into the JSON as
`nombre_es`. Any token the dictionary doesn't recognise is kept, lowercased,
in parentheses at the end so nothing silently disappears and search still
finds it.

Run: python3 scripts/translate_exercises.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "ejercicios-es.json"

# --- Exact full-name overrides (well-known / idiomatic exercise names) ----
EXACT = {
    "3/4 sit-up": "Abdominal 3/4",
    "45 degree side bend": "Inclinación lateral a 45 grados",
    "air bike": "Bicicleta abdominal",
    "arnold press": "Press Arnold",
    "cuban press": "Press cubano",
    "zottman curl": "Curl Zottman",
    "good morning": "Buenos días",
    "dead bug": "Dead bug (bicho muerto)",
    "superman": "Superman",
    "burpee": "Burpee",
    "jack burpee": "Burpee con jack",
    "london bridge": "Puente de Londres",
    "farmer's walk": "Paseo del granjero",
    "farmers walk": "Paseo del granjero",
    "russian twist": "Giro ruso",
    "turkish get-up": "Get-up turco",
    "man maker": "Man maker",
    "bear crawl": "Oso rastrero (bear crawl)",
    "spider curl": "Curl araña",
    "skull crusher": "Rompecráneos (press francés)",
    "world's greatest stretch": "Estiramiento total del cuerpo",
    "rope climb": "Escalada de cuerda",
    "figure 8": "Ejercicio en forma de 8",
    "l-pull-up": "Dominada en L",
    "l-sit": "L-sit",
    "pistol squat": "Sentadilla pistol",
    "cossack squat": "Sentadilla cosaca",
    "sissy squat": "Sentadilla sissy",
    "jefferson curl": "Curl Jefferson",
    "seal row": "Remo foca",
    "muscle-up": "Muscle-up",
    "monster walk": "Caminata del monstruo",
}

# Multi-word phrases merged into a single hyphenated token before splitting,
# so the dictionaries below can treat them as one unit.
PHRASE_NORMALIZE = [
    ("bent over", "bent-over"), ("bent-over", "bent-over"),
    ("one arm", "one-arm"), ("single arm", "one-arm"), ("one-arm", "one-arm"),
    ("two arm", "two-arm"), ("both arms", "two-arm"),
    ("one leg", "one-leg"), ("single leg", "one-leg"),
    ("two legs", "two-leg"), ("both legs", "two-leg"),
    ("medicine ball", "medball"), ("stability ball", "fitball"),
    ("swiss ball", "fitball"), ("exercise ball", "fitball"),
    ("behind the neck", "behind-head"), ("behind head", "behind-head"),
    ("behind the head", "behind-head"),
    ("close grip", "close-grip"), ("close-grip", "close-grip"),
    ("wide grip", "wide-grip"), ("wide-grip", "wide-grip"),
    ("reverse grip", "reverse-grip"),
    ("neutral grip", "neutral-grip"),
    ("hammer grip", "hammer-grip"),
    ("false grip", "false-grip"),
    ("v-grip", "v-grip"),
    ("push up", "push-up"), ("pull up", "pull-up"), ("chin up", "chin-up"),
    ("sit up", "sit-up"), ("step up", "step-up"), ("v up", "v-up"),
    ("muscle up", "muscle-up"),
    ("ez bar", "ezbar"), ("ez barbell", "ezbar"), ("e-z bar", "ezbar"),
    ("v. bar", "vbar"), ("v-bar", "vbar"),
    ("on knees", "kneeling"), ("on his knees", "kneeling"),
    ("on toes", "on-toes"),
    ("french press", "frenchpress"),
    ("push press", "pushpress"),
    ("leg raised", "leg-raised"), ("leg extended", "leg-extended"),
    ("hip flexor", "hipflexor"), ("hip flexors", "hipflexors"),
    ("behind neck", "behind-head"), ("behind the neck press", "behind-head press"),
    ("lower back", "lowerback"),
    ("gluteus and piriformis", "gluteus piriformis"),
    ("good morning", "goodmorning"), ("skull crusher", "skullcrusher"),
    ("turkish get-up", "turkishgetup"), ("turkish get up", "turkishgetup"),
    ("curl-up", "curlup"), ("curl up", "curlup"),
]


def normalize_phrases(text):
    for phrase, token in PHRASE_NORMALIZE:
        text = re.sub(r"\b" + re.escape(phrase) + r"\b", token, text)
    return text


# --- Vocabulary --------------------------------------------------------
MOVEMENT = {
    "curl": "curl", "press": "press", "raise": "elevación", "raises": "elevaciones",
    "row": "remo", "squat": "sentadilla", "squatting": "sentadilla",
    "extension": "extensión", "fly": "aperturas", "flye": "aperturas", "flyes": "aperturas",
    "pulldown": "jalón", "pullover": "pullover", "deadlift": "peso muerto",
    "lunge": "zancada", "lunges": "zancadas", "twist": "giro", "twisting": "giro",
    "crunch": "encogimiento abdominal", "shrug": "encogimiento de hombros",
    "kickback": "patada", "dip": "fondo", "dips": "fondos", "jump": "salto",
    "jumps": "saltos", "stretch": "estiramiento", "plank": "plancha",
    "bridge": "puente", "rotation": "rotación", "sit-up": "abdominal",
    "push-up": "flexión", "pushup": "flexión",
    "push": "empuje", "pull": "tirón", "chin-up": "dominada",
    "pull-up": "dominada", "clean": "cargada", "snatch": "arrancada",
    "swing": "swing", "march": "marcha", "walk": "caminata", "walkout": "walkout",
    "carry": "transporte", "climb": "escalada", "hold": "isométrico",
    "pushdown": "extensión en polea", "thrust": "empuje de cadera", "thrusts": "empujes de cadera",
    "rollout": "rollout", "rollerout": "rollout", "abduction": "abducción",
    "adduction": "aducción", "flexion": "flexión", "circles": "círculos",
    "circle": "círculo", "hyperextension": "hiperextensión",
    "step-up": "subida al cajón", "step": "subida", "kickout": "patada",
    "touch": "toque", "touches": "toques", "toucher": "toque", "touchers": "toques",
    "scissor": "tijera", "scissors": "tijeras", "bicycle": "bicicleta",
    "crossover": "cruce", "crossovers": "cruces",
    "hack": "hack", "v-up": "V-up", "v-ups": "V-ups", "sprawl": "sprawl",
    "frenchpress": "press francés", "pushpress": "empuje de press",
    "muscle-up": "muscle-up", "get-up": "get-up",
    "goodmorning": "buenos días", "skullcrusher": "rompecráneos (press francés)",
    "turkishgetup": "get-up turco",
    "curlup": "abdominal (curl-up)",
}

EQUIPMENT = {
    "dumbbell": "mancuerna", "dumbbells": "mancuernas", "barbell": "barra",
    "cable": "polea", "kettlebell": "kettlebell", "band": "banda elástica",
    "banded": "con banda elástica", "smith": "multipower", "lever": "máquina",
    "machine": "máquina", "ezbar": "barra Z", "medball": "balón medicinal",
    "fitball": "fitball",
    "bodyweight": "peso corporal", "sled": "trineo", "plate": "disco",
    "bench": "banco", "roller": "rueda abdominal", "bar": "barra",
    "rope": "cuerda", "chain": "cadena", "sandbag": "saco de arena",
    "trx": "TRX", "suspension": "suspensión (TRX)", "wheel": "rueda",
    "bosu": "bosu", "vbar": "barra V",
    "towel": "toalla", "box": "cajón", "chair": "silla", "wall": "pared",
    "pole": "barra", "log": "tronco", "belt": "cinturón", "ball": "balón",
}

STANCE = {
    "seated": "sentado", "sitted": "sentado", "standing": "de pie",
    "lying": "tumbado", "prone": "boca abajo", "supine": "boca arriba",
    "kneeling": "de rodillas", "incline": "inclinado", "declined": "declinado",
    "decline": "declinado", "hanging": "colgado", "floor": "en el suelo",
    "half-kneeling": "medio arrodillado", "bent-over": "inclinado hacia adelante",
    "on-toes": "de puntillas",
}

GRIP_SIDE = {
    "wide-grip": "agarre amplio", "close-grip": "agarre cerrado",
    "reverse-grip": "agarre invertido", "reverse": "agarre invertido",
    "underhand": "agarre supino", "overhand": "agarre prono",
    "neutral-grip": "agarre neutro", "hammer-grip": "agarre martillo",
    "hammer": "martillo", "false-grip": "agarre falso", "v-grip": "agarre en V",
    "preacher": "predicador", "upright": "vertical",
    "grip": "agarre", "two-arm": "a dos brazos", "alternate": "alterno",
    "alternating": "alterno", "unilateral": "unilateral", "narrow": "agarre estrecho",
}

BODY_PART = {
    "leg": "pierna", "legs": "piernas", "calf": "gemelo", "calves": "gemelos",
    "biceps": "bíceps", "bicep": "bíceps", "triceps": "tríceps", "tricep": "tríceps",
    "chest": "pecho", "shoulder": "hombro", "shoulders": "hombros", "hip": "cadera",
    "hips": "caderas", "wrist": "muñeca", "lat": "dorsal", "lats": "dorsales",
    "delt": "deltoides", "delts": "deltoides", "deltoid": "deltoides",
    "back": "espalda", "glute": "glúteo",
    "glutes": "glúteos", "gluteus": "glúteo", "quad": "cuádriceps", "quads": "cuádriceps",
    "hamstring": "isquiotibial", "hamstrings": "isquiotibiales", "ab": "abdominal",
    "abs": "abdominales", "neck": "cuello", "forearm": "antebrazo",
    "forearms": "antebrazos", "trap": "trapecio", "traps": "trapecios",
    "knee": "rodilla", "knees": "rodillas", "ankle": "tobillo", "finger": "dedo",
    "toe": "dedo del pie", "toes": "dedos del pie", "spine": "columna", "core": "core",
    "obliques": "oblicuos", "piriformis": "piriforme", "spinal": "espinal",
    "arm": "brazo", "arms": "brazos", "elbow": "codo", "groin": "ingle",
    "hand": "mano", "hands": "manos",
    "hipflexor": "flexor de cadera", "hipflexors": "flexores de cadera",
    "lowerback": "zona lumbar",
}

MISC = {
    "high": "alto", "low": "bajo", "full": "completo", "partial": "parcial",
    "behind-head": "tras nuca", "overhead": "por encima de la cabeza",
    "assisted": "asistido", "weighted": "con peso lastrado",
    "plyo": "pliométrico", "plyometric": "pliométrico",
    "explosive": "explosivo", "static": "estático", "military": "militar",
    "front": "frontal", "rear": "posterior", "lateral": "lateral", "side": "lateral",
    "cross": "cruzado", "crossed": "cruzado",
    "with": "", "and": "y", "on": "", "over": "sobre",
    "of": "", "to": "", "in": "", "for": "para", "an": "un",
    "your": "tu", "up": "hacia arriba", "down": "hacia abajo", "out": "hacia afuera",
    "apart": "separados", "together": "juntos",
    "circular": "circular", "response": "de respuesta", "run": "con carrera",
    "release": "y liberación", "motion": "con movimiento", "bent": "flexionada",
    "straight": "recto", "raised": "elevada", "extended": "extendida",
    "fixed": "fijo", "long": "largo", "short": "corto",
    "half": "medio", "quarter": "cuarto", "diagonal": "diagonal",
    "vertical": "vertical", "horizontal": "horizontal",
    "against": "contra", "between": "entre", "around": "alrededor",
    "sideways": "de lado", "forward": "hacia adelante", "backward": "hacia atrás",
    "under": "bajo", "leaning": "apoyado", "no": "sin", "without": "sin",
    "concentration": "concentrado", "french": "francés", "heel": "talón",
    "heels": "talones", "kick": "patada", "jack": "jack", "knife": "en navaja",
    "bowling": "estilo bowling", "monster": "del monstruo", "maltese": "maltés",
    "straddle": "a horcajadas", "self": "asistido", "elevated": "elevado",
    "stance": "postura", "wide-stance": "postura amplia",
    "run": "carrera", "release": "liberación", "response": "respuesta",
    "motion": "movimiento", "wide": "amplio", "narrow": "estrecho",
    "inverted": "invertido", "reps": "repeticiones", "rep": "repetición",
    "ring": "anilla", "rings": "anillas", "clap": "con palmada",
    "stride": "zancada larga", "lift": "elevación",
    "internal": "interna", "external": "externa",
}

DANGLING_WORDS = {"con", "y", "sobre", "en", "a", "de", "hacia", "para"}

FRACTIONS = {"3/4": "3/4", "1/4": "1/4", "1/2": "1/2"}

STOPWORDS_DROP = {"exercise", "the", "a", "-"}
NOISE_NOTES = {"male", "female", "pov", "back pov", "side pov", "back", "his", "her"}

LEG_HINTS = {"leg", "legs", "calf", "calves", "knee", "knees", "hip", "hips", "glute",
             "glutes", "gluteus", "quad", "quads", "hamstring", "hamstrings", "ankle",
             "toe", "toes"}
ARM_HINTS = {"arm", "arms", "wrist", "bicep", "biceps", "tricep", "triceps",
             "shoulder", "shoulders", "hand", "elbow", "forearm", "forearms"}


def strip_variant_suffix(name):
    m = re.search(r"\s*-?\s*v\.\s*(\d+)\s*$", name)
    if m:
        return name[: m.start()].strip(" -"), f" (variante {m.group(1)})"
    return name, ""


def classify(word):
    for table, kind in ((MOVEMENT, "movement"), (EQUIPMENT, "equipment"),
                         (STANCE, "stance"), (GRIP_SIDE, "grip"),
                         (BODY_PART, "body"), (MISC, "misc"), (FRACTIONS, "misc")):
        if word in table:
            return kind
    return "unknown"


def translate_word(word, tokens_context):
    if word == "one-arm":
        return "a un brazo"
    if word == "one-leg":
        return "a una pierna"
    if word == "two-leg":
        return "a dos piernas"
    if word in ("one", "single"):
        if LEG_HINTS & tokens_context:
            return "a una pierna" if word == "one" else "unilateral"
        return "a un brazo" if word == "one" else "unilateral"
    for table in (MOVEMENT, EQUIPMENT, STANCE, GRIP_SIDE, BODY_PART, MISC, FRACTIONS):
        if word in table:
            return table[word]
    return None


def tokenize(base):
    tokens = re.findall(r"[a-z0-9°/]+(?:-[a-z0-9°/-]+)*|[a-z0-9°/]+", base)
    return [t for t in tokens if t and t not in STOPWORDS_DROP]


def dedupe(seq):
    seen, out = [], set()
    for s in seq:
        if s and s not in out:
            out.add(s)
            seen.append(s)
    return seen


def gloss_note(note):
    """Short, literal word-by-word gloss for a parenthetical annotation."""
    note = note.strip().lower()
    if not note or note in NOISE_NOTES:
        return None
    note = normalize_phrases(note)
    tokens = tokenize(note)
    ctx = set(tokens)
    words = []
    for tok in tokens:
        translated = translate_word(tok, ctx)
        if translated is None and "-" in tok:
            parts = tok.split("-")
            sub = [translate_word(p, ctx) for p in parts]
            if all(s is not None for s in sub):
                translated = " ".join(s for s in sub if s)
        if translated is None:
            words.append(tok)
        elif translated != "":
            words.append(translated)
    return " ".join(words) if words else None


def translate_name(raw):
    key = raw.strip().lower()
    if key in EXACT:
        return EXACT[key]

    base, variant_suffix = strip_variant_suffix(key)
    paren_notes = re.findall(r"\(([^)]*)\)", base)
    base = re.sub(r"\([^)]*\)", " ", base)
    base = normalize_phrases(base.replace("'", ""))
    tokens = tokenize(base)
    ctx = set(tokens)

    slots = {"movement": [], "equipment": [], "stance": [], "grip": [], "body": [], "misc": [], "unknown": []}
    for tok in tokens:
        translated = translate_word(tok, ctx)
        kind = classify(tok) if tok not in ("one", "single", "one-arm", "one-leg", "two-leg") else "grip"
        if translated is None and "-" in tok:
            parts = tok.split("-")
            sub = [translate_word(p, ctx) for p in parts]
            if all(s is not None for s in sub):
                translated = " ".join(s for s in sub if s)
                kind = classify(parts[0])
        if translated is None:
            slots["unknown"].append(tok)
            continue
        if translated == "":
            continue
        slots[kind].append(translated)

    movement = dedupe(slots["movement"])
    equipment = dedupe(slots["equipment"])
    stance = dedupe(slots["stance"])
    grip = dedupe(slots["grip"])
    body = dedupe(slots["body"])
    misc = dedupe(slots["misc"])

    head = " ".join(movement) if movement else (" ".join(body) if body else "Ejercicio")
    parts = [head]
    if body and movement:
        parts.append(" ".join(body))
    if misc:
        parts.append(" ".join(misc))
    if grip:
        parts.append(" ".join(grip))
    if stance:
        parts.append(" ".join(stance))
    if equipment:
        parts.append("con " + " y ".join(equipment))

    result = " ".join(p for p in parts if p).strip()
    result = re.sub(r"\s+", " ", result).strip()
    words = result.split(" ")
    while words and words[-1].lower() in DANGLING_WORDS:
        words.pop()
    result = " ".join(words)
    result = result[0].upper() + result[1:] if result else raw

    extras = []
    for note in paren_notes:
        glossed = gloss_note(note)
        if glossed:
            extras.append(glossed)
    if slots["unknown"]:
        extras.extend(slots["unknown"])
    extras = dedupe(extras)

    if extras:
        result += " (" + ", ".join(extras) + ")"
    result += variant_suffix
    return result.strip()


def main():
    data = json.loads(SRC.read_text())
    for item in data:
        item["nombre_es"] = translate_name(item["nombre"])
    SRC.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"Translated {len(data)} exercise names -> {SRC}")


if __name__ == "__main__":
    main()
