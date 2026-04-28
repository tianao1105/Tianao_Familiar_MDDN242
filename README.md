# Wickman
## Wickman: Generative System

MDDN242 2026, Tianao Wang

Wickman is a pixel-art RPG character who lives in the browser. He fights monsters, levels up, collects gear, and casts spells on his own. The background changes with the real weather and time of day wherever you are.


## Design Intent

### The goal

I wanted an RPG character that grows by itself, without needing to be actively played.

### Why this direction

I've been playing RPGs since I was a kid. The level climbing, the new weapon dropping, the skill finally unlocking. That feeling never gets old. The question was whether I could make it ambient. Something running in a tab, growing on its own, but still needing you to show up once in a while.

The first version was just a creature that drifted and reacted to clicks. Battle came later, once I realised nothing happened when you weren't there. Adding autonomous combat gave him a reason to move on his own, and the character made more sense from that point.

### Who is this for

Anyone who's ever left an RPG running just to watch the numbers go up. Also anyone who's killed a Tamagotchi by forgetting about it.

#### Triggers

| Trigger | What happens |
|---------|--------|
| Click anywhere on canvas | Feeds Wickman (restores HP); revives him when KO'd |
| Loud ambient sound | Excited state: pupils enlarge, he reacts to the noise |
| 30 s without any click | Auto-battle starts, monsters spawn, he fights alone |
| Need > 70 | Distressed: shakes, fades, dialogue gets urgent |
| Need = 100 | KO: he walks back to centre and says something |
| Monster killed | XP gained; random chance to drop a collectible |
| Level up | Max HP +10, ATK +1, SPD +1; spells unlock at Lv 5 and Lv 10 |
| Tab loses focus | Need rises twice as fast |

#### Weapons

| Weapon | Bonus | Effect |
|--------|-------|--------|
| Sword | +12 ATK | More melee damage |
| Hammer | +18 ATK | Highest damage, slower swing |
| Dagger | +0.8 SPD | Attacks noticeably faster |
| Shield | +8% DEF | Takes less damage |
| Orb | +regen MP | Mana regenerates faster |
| Wand | +✦ | Stays at centre, casts from range |

Two weapons at once. Click **Roll** to randomise. Two Orbs stacks the mana bonus.

#### Basic controls

| Action | How |
|--------|-----|
| Feed | Click anywhere on the canvas |
| Equip weapons | Roll button or click a weapon slot |
| Toggle battle | Battle button or the sword icon in the HUD |
| Change appearance | Dress button |
| Collectibles | Click the Collectibles bar |
| Settings | Need decay slider, feed amount slider, Heal, Reset Level |

---

### Visual references

- [Open-Meteo](https://api.open-meteo.com/v1/forecast): weather data (temperature + weather code) for background tinting
- [WorldTimeAPI](https://worldtimeapi.org/api/ip): local timezone for the clock
- [Nominatim](https://nominatim.openstreetmap.org/reverse): reverse geocoding to get city name from coordinates

### Artists, designers, sites

- Equipment layout based on World of Warcraft's character panel

### Movements or aesthetics

- Pixel art. The constraint forces every detail to be deliberate. Low resolution as a style choice, not a limitation.

---

## Familiar

Wickman is a pixel-art RPG warrior who lives in the browser. He fights monsters, levels up, and reacts to whoever's watching, or not watching.

### Name & identity

He's a small humanoid warrior. You can rename him in the sidebar. In battle he shrinks down and chases monsters; outside of battle he drifts back to the centre and idles. His face reacts to sound and changes with his mood.

### The metaphor

Wickman is about the satisfaction of progression: watching a number go up, a new weapon appear, a stat increase. But it also works the other way. If you ignore him long enough he deteriorates, gets distressed, and eventually collapses. The same loop that makes RPGs feel rewarding also makes them feel like an obligation.

### Personality

When he's healthy he's eager and bouncy and picks fights on his own. When he's been ignored he shakes, fades out, and starts saying things. Loud noises startle him. If you leave him in the middle of a battle and come back, he'll let you know. He remembers how long you were gone.

### Why this concept

I've always liked games where things keep happening even when you're not playing. Idle games, auto-battlers, Tamagotchis. I wanted to build something that felt like that, a character with a life outside of active play, but one that still needs you to come back.

---

## Need

Wickman has a Need value that rises constantly over time. It's basically hunger, but also loneliness. When it hits 100 he collapses.

### What it wants

Clicks. The Need value drops when you click on him. It rises faster when the tab is out of focus, slower when you're there. It also remembers how long you were away; come back after a few hours and he'll already be in bad shape.

### What happens when it goes unmet

As Need rises he goes from `happy` → `neutral` → `distressed`. Distressed means shaking, fading, and increasingly annoyed dialogue. In battle, high Need also represents HP damage; he's fighting hurt.

### What satisfies it

Clicking feeds him. Winning battles earns XP and levels him up. Each level increases his stats and raises his max HP. He responds with floating text and dialogue.

### The attention economy angle

He asks for clicks. Deliberate, recurring clicks. That's the same mechanic every app and game uses to bring you back. The difference here is that it's visible and intentional. It's a reflection more than a critique, but the mechanic is honest about what it's doing.

---

## States

| State | Look / behaviour |
|-------|-----------------|
| Happy | Bouncy, fully opaque, need ≤ 30 |
| Neutral | Slightly transparent, gentle bounce, need 30–70 |
| Distressed | Shaking, 50% transparent, need > 70 |
| Excited | Big pupils, speaks aloud, triggered by loud sound |
| KO | Fades to near-transparent, walks back to centre, then says something |

### Transitions

- Need rises every frame, faster when tab is unfocused, faster still when you've been away for hours
- Clicking drops need; loud sound triggers the excited state for ~40 frames
- At need 30 and 70 the state flips; at need 100 he goes KO
- No clicks for 30 seconds → auto-battle starts on its own

### Autonomous behaviour

When nothing is happening, Wickman drifts back to the centre. After 30 seconds without a click he starts spawning monsters and fighting alone. When you come back and click, he exits battle mode and complains about it.

### Persistence

localStorage keeps Need, XP, level, weapons, collectibles, and the timestamp of the last visit. On return it calculates how long you were gone and adds to Need accordingly. Leave for a few hours, come back to a distressed Wickman. Leave for a day, come back to a dead one.

---

## Inputs

### Input 1: Mouse click

Clicking is the most direct form of attention. It's deliberate; you have to mean it. Feeds Wickman, exits auto-battle, and activates the microphone on first click.

### Input 2: Time and weather

The background changes with the real hour (midnight navy → dawn rose → midday sage → dusk violet) and with weather data. Rain cools and darkens it, snow brightens it, storms deepen it. The idea was that Wickman exists in the same environment as the person watching him.

### Additional inputs

**Microphone**: activates on first click. Loud sounds trigger the excited state. Wickman reacts with things like "Are you talking to me?" There's a ~5 second cooldown between triggers. An earlier version moved him toward wherever the sound was loudest, like a tracker. It looked wrong, so I replaced it with dialogue instead.

**Tab focus**: Need rises twice as fast when the tab is hidden. He knows when you've switched away.

### Inputs considered but not used

Keyboard shortcuts: felt like controlling a game rather than caring for something. Scroll input: triggered too easily while browsing other content in the same session. A KO overlay was also tried early on but removed — having him walk back and speak on his own felt more like a character reaction and less like a system error.

---

## AI Disclosure

### Tools used

- Claude, running as a VS Code extension

### How you used them

Ongoing conversation inside VS Code across multiple sessions. I'd describe what I wanted, usually in Chinese, sometimes in English, and Claude would write or edit the code. I'd test it in the browser and give the next instruction. It worked more like pair programming than copy-pasting.

### What you used AI for

- All the JavaScript in `sketch.js`: battle system, spells, monster variants, collectibles, KO state, XP curve, mana scaling, sound dialogue
- CSS for the sidebar, collectibles grid, state badges
- HTML structure for the equipment panel and skill slots
- Writing and editing this README

### What worked

Describing behaviour rather than implementation. "When HP hits zero, have him walk back to the centre and then say something" worked in one pass. Small, specific requests worked much better than big vague ones.

### What didn't work

Vague requests like "make battle feel better"; they produced changes I didn't actually want. Narrowing to something like "increase monster speed when the character is happy, reduce it when distressed" gave much better results. Early README drafts were also way too long and formal; I had to keep asking to cut them back.
