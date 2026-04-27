## Generative System

MDDN242 2026 — Tianao Wang

This project is similar to an RPG-style mini-game. You can engage in simple monster battles for leveling up, and possess a small amount of equipment and magic. Change the battle scene according to the location's weather and time.


## Design Intent

### The goal

Want to create a character in an RPG that can grow automatically.

### Why this direction

Since childhood, I have been exposed to many RPG games. So I was wondering, why can't the characters in RPGs grow gradually? I enjoy the feeling of the level gradually increasing. Every time I LEVEL UP, every time I see a new weapon equipped or acquire new skills, there is a different feeling.

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

Introduce your familiar. What is it?

### Name & identity

Give your familiar a name. What kind of entity is it — creature, object, spirit, something else? What does it look like?

### The metaphor

What does your familiar represent or evoke? What idea, feeling, or topic is it an expression of?

### Personality

How does it behave? What are its characteristic traits? Is it anxious, curious, demanding, shy? What makes it feel like a distinct entity and not just a program?

### Why this concept

What drew you to this particular familiar? What does it mean to you?

---

## Need

Your familiar must "want" or "need" something. Describe the mechanic.

### What it wants

The familiar needs attention and interaction. Its Need value rises continuously over time — faster when the tab is out of focus, slower when the user is present. It also accumulates need based on how long the user has been away since the last visit.

### What happens when the need goes unmet

As need rises, the familiar shifts from `happy` → `neutral` → `distressed`. In distressed state it shakes, becomes semi-transparent, and displays urgent dialogue. In battle mode, unmet need also represents HP damage taken from monsters.

### What satisfies it

Clicking the canvas feeds the familiar, reducing the need value. Winning battles earns XP and levels up the familiar, increasing its max HP and stats. The familiar responds with bounce animations, floating text, and dialogue.

### The attention economy angle

Your familiar is, in some way, part of the attention economy — it asks something of the viewer. What does it ask for, and why did you design it that way? Is this a critique, a reflection, something neutral?

---

## States

Describe the states your familiar can be in and how it moves between them.

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

Your familiar must respond to at least two different types of input. Document them here.

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

Did you explore any input types that didn't end up working or fitting?
