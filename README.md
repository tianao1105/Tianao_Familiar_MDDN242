# Familiar

A pixel-style virtual companion based on p5.js, featuring an RPG combat system, real-time weather, and background with day and night changes.

## Function Introduction

### Partner System
- Partners have **Need values**, which increase automatically over time.
- Clicking on the canvas can feed the partner, reducing the need value.
- The need value affects the partner's state: `happy` / `neutral` / `distressed` / `excited`.
- If the page is not opened for a long time, the need value will accumulate based on the duration of the absence.

### RPG Panel

| Attribute | Explanation |
|-----------|-------------|
| HP | Converted from the demand value. The lower the demand, the higher the HP. |
| MP | Automatically replenished during battles, used for skill activation. |
| ATK | Attack power, increases with level. |
| SPD | Movement speed, increases with level. |
| DEF | Defense reduction (in %), +1% per level from 1 to 10, +0.5% per level after 10. |

### Level and Experience
- Earn XP by defeating monsters
- Level up every 20 XP points, and various attributes will increase accordingly
- The level can be reset in the settings menu

### Battle System
- Click the ⚔ **Battle** button to activate the battle mode.
- Monsters spawn from the edge of the screen and start chasing once they enter the sensing range of the screen.
- Allies automatically attack the nearest monster.
- **Monsters are divided into three levels**: Normal / Elite / Boss. The proportion of Bosses dynamically adjusts according to the player's level (at level 100, Bosses account for approximately 50%).

### Skill System

| Skill | Unlock Level | Range | Damage | Mana Consumption |
|-------|--------------|-------|--------|------------------|
| Water Bomb | Level 5 | 260 px | Attack × 1.4 | 15 |
| Fireball | Level 10 | 520 px | Attack × 2.2 | 25 |

- After level 10, fireballs are released first; during the cooling period of fireballs, water bombs are released as a substitute.
- The skill icon is displayed below the sidebar attributes, with a cooling mask and a ready highlight indication.

### Weapon System
- Click 🎲 **Roll** to randomly equip two weapons
- Each weapon has an exclusive attribute bonus, which is displayed after the corresponding attribute.

| Weapon | Exclusive Attribute | Effect |
|--------|---------------------|--------|
| Sword | ATK | +12 Attack |
| Hammer | ATK | +18 Attack |
| Dagger | SPD | Increases movement speed |
| Shield | DEF | +8% Damage reduction |
| Orb | MP | Accelerates Mana regeneration |
| Wand | ATK | Fires an additional secondary projectile when casting spells |

### Automatic Battle upon Hang-up
- If there is no click on the page for more than 30 seconds, the battle mode will automatically start.
- Clicking on the canvas will restore the normal state. The companions will say: *"You left me to fight alone?!"*

### Day and Night with Weather
- The background color changes according to the actual time (deep blue at midnight → rose color in the morning → light green at noon → orange-red in the evening)
- If the browser allows location tracking, it automatically retrieves the local weather and superimposes the corresponding color tone (warm color for sunny days, cool gray for rainy days, bright white for snowy days)

### Decoration System
The left column of the sidebar allows you to switch between decorations: hat / crown / bow tie / blush / glitter.

---

## Operating Instructions

| Operation | Effect |
|-----------|--------|
| Click the canvas | Feed / Resume idle state |
| 🍶 Feed | Feed |
| 🧹 Clear | Clear the canvas doodles |
| ❤ Heal | Full health (reduces required value to zero) |
| 🎲 Roll | Randomly change weapons |
| ⚔ Battle | Switch to combat mode |
| 🎭 Dress | Randomly change clothes |
| ⚠ Reset Level | Reset level and experience |

---

## Technology Stack

- [p5.js](https://p5js.org/) v1.7.0 — Canvas Rendering
- [Open-Meteo](https://open-meteo.com/) — Free Weather API
- [WorldTimeAPI](https://worldtimeapi.org/) — Time Zone Time API
- [Nominatim](https://nominatim.org/) — Reverse Geocoding (City Name)

---

## File Structure

```
├── index.html        # Page structure and RPG sidebar
├── style.css         # Styles
├── sketch.js         # Main logic (p5.js)
└── image/
    ├── human.png         # Character portrait
    ├── crown.png         # Toggle icon for sidebar
    ├── water_magic.png   # Water bomb icon
    ├── fair_magic.png    # Fireball icon
    ├── sword.png         # Weapon image
    └── ...               # Other weapon / monster images
```

---

*MDDN242 — Victoria University of Wellington*
