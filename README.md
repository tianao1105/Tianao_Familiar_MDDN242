## Generative System

MDDN242 2026 — Tianao Wang

This project is similar to an RPG-style mini-game. You can engage in simple monster battles for leveling up, and possess a small amount of equipment and magic. Change the battle scene according to the location's weather and time.


## Design Intent

### The goal

Want to create a character in an RPG that can grow automatically.

### Why this direction

Since childhood I have been drawn to RPG games — the feeling of a level gradually climbing, a new weapon equipping, a skill unlocking. The familiar grew from a simple idea: a character that grows on its own, without needing to be played, but still needing to be cared for.

### Who is this for

The target audience is gamers.


### Visual references

- [Open-Meteo](https://api.open-meteo.com/v1/forecast)  — Real-time weather data (temperature and weather code) for background colour tinting
- [WorldTimeAPI](https://worldtimeapi.org/api/ip) — Local timezone detection for accurate clock display
- [Nominatim](https://nominatim.openstreetmap.org/reverse) — Reverse geocoding to retrieve city name from coordinates


### Artists, designers, sites

- Refers to the equipment bar in World of Warcraft

### Movements or aesthetics

- pixel art — the lo-fi aesthetic of early games, where limited resolution forces every detail to be intentional


---

## Familiar

The familiar is a pixel-art RPG warrior that lives in the browser. It fights monsters autonomously, levels up through battle, and responds to the user's attention — growing stronger when cared for, deteriorating when ignored.

### Name & identity

The familiar is a nameable humanoid warrior rendered in pixel art style. The player assigns a name via the sidebar input. It appears as a small armoured figure that shrinks into battle stance during combat and expands to full size when at rest. Its face responds to sound, state, and mouse proximity.

### The metaphor

The familiar is an expression of progression and dependency. It represents the compulsive satisfaction of watching a level climb — the XP bar filling, the new weapon equipping, the stats growing. It also reflects how that satisfaction requires maintenance: the character deteriorates without presence, mirroring how digital things demand ongoing attention to stay alive.

### Personality

In the happy state it bounces eagerly and picks fights. When neglected it shakes and fades, becoming visibly distressed. Loud sounds excite it into chasing the cursor. It talks back — celebrating victories, complaining about abandonment, calling out when left to fight alone. It feels distinct because its state is persistent and personal: it remembers how long you were gone and holds it against you.

### Why this concept

RPG progression has been a constant thread since childhood. The familiar is an attempt to make that feeling ambient — a character that grows on its own without requiring direct play, but still needs presence and care to thrive. It is the RPG loop stripped to its emotional core.

---

## Need

The familiar's core mechanic is a Need value that rises continuously over time, representing hunger, loneliness, and the cost of being left alone.

### What it wants

The familiar needs attention and interaction. Its Need value rises continuously over time — faster when the tab is out of focus, slower when the user is present. It also accumulates need based on how long the user has been away since the last visit.

### What happens when the need goes unmet

As need rises, the familiar shifts from `happy` → `neutral` → `distressed`. In distressed state it shakes, becomes semi-transparent, and displays urgent dialogue. In battle mode, unmet need also represents HP damage taken from monsters.

### What satisfies it

Clicking the canvas feeds the familiar, reducing the need value. Winning battles earns XP and levels up the familiar, increasing its max HP and stats. The familiar responds with bounce animations, floating text, and dialogue.

### The attention economy angle

The familiar asks for clicks — a deliberate, recurring gesture of attention. This mirrors how games and apps train users to return regularly through reward loops and decay mechanics. It is both a critique and an honest reflection: the need system makes visible the dependency that most digital companions keep hidden.

---

## States

The familiar moves between four states driven by need level, input, and time.

### States

| State | Appearance / behaviour |
|-------|------------------------|
| Happy | Bouncy, fully opaque, need ≤ 30 |
| Neutral | Slightly transparent, gentle bounce, need 30–70 |
| Distressed | Shaking, 50% transparent, need > 70 |
| Excited | Large pupils, chases mouse cursor, triggered by loud sound via microphone |

### Transitions

- **Time-based:** need rises every frame at a fixed decay rate, pushing the familiar from happy toward distressed
- **Input-based:** clicking feeds the familiar and drops need; mic input above threshold triggers excited state for 40 frames
- **Threshold-based:** state switches at need values 30 and 70; battle mode activates automatically after 30 seconds without a click

### Autonomous behaviour

When no one is interacting, the familiar drifts back to the centre of the canvas. After 30 seconds without a click, it enters auto-battle mode — spawning monsters and fighting them alone. When the user returns and clicks, it exits battle mode and says *"You left me to fight alone?!"*

### Persistence across visits

localStorage saves need value, XP, level, equipped weapons, decorations, and the timestamp of the last visit. On return, the familiar calculates how long the user was away and adds accumulated need accordingly. A long absence means returning to a distressed familiar; a quick revisit feels continuous.

---

## Inputs

The familiar responds to four types of input, each representing a different mode of presence.

### Input 1 — type and why

**Type:** Mouse click

**Why this input:** Clicking is the most direct form of attention — it requires deliberate action, not just passive presence.

**How the familiar responds:** Feeds the familiar (reduces need), exits idle auto-battle mode, and activates the microphone on first click.

### Input 2 — type and why

**Type:** Time of day and real-time weather API

**Why this input:** The familiar exists alongside the user's real world. Having the background reflect actual weather and time of day makes it feel like a living environment rather than a static screen.

**How the familiar responds:** Background colour interpolates through a palette tied to the hour (midnight navy → dawn rose → midday sage → dusk violet). Weather data shifts the tint further — rain darkens and cools, snow brightens, storms deepen.

### Any additional inputs

**Type:** Microphone (ambient sound level)

The microphone activates on first canvas click. When sound exceeds the threshold, the familiar enters the excited state — pupils enlarge and it chases the mouse cursor for 40 frames.

**Type:** Page focus / visibility

The need decay rate doubles when the browser tab loses focus, reflecting that the familiar is aware of being ignored.

### Inputs you considered but didn't use

Keyboard shortcuts for feeding and battle were considered but dropped — they made the interaction feel like a game controller rather than a relationship. Scroll-based input was also tested but triggered too easily while the user was browsing other content on the page.
