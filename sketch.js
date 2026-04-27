// ============================================================
//  YOUR CREATURE  —  sketch.js
//  MDDN242 Project 2
// ============================================================
//
//  QUICK START
//  1. Edit drawBody() to redesign the shape
//  2. Edit drawEyes() — or remove the call to drop eyes entirely
//  3. Add a new state in STATES + one line in getState()
//  4. Tune the SETTINGS constants at the top
//  5. Rename "need" to match your concept (hunger, loneliness…)
//
// ============================================================

new p5(function(p) {

    // ============================================================
    //  SETTINGS  —  tweak these, or use the sidebar sliders
    // ============================================================

    const SHOW_UI      = true;   // set false to hide the sidebar while designing

    let CREATURE_SIZE  = 220;    // body diameter in pixels
    let DECAY_RATE     = 0.003;  // need rise per frame while tab is focused
    let AWAY_RATE      = 0.020;  // need rise per frame while tab is hidden
    let AFK_PER_HOUR   = 5;      // extra need added per hour since last visit
    let AFK_MAX_HOURS  = 168;    // cap time-away at 7 days
    let CLICK_FEED     = 20;     // how much a click reduces need
    let MIC_THRESHOLD  = 0.15;   // how loud is "loud" (0–1)
    let EXCITED_FRAMES = 40;     // how long the excited state lasts
    let BOUNCE_SCALE   = 1.0;    // multiplier for all bounce amounts

    let bodyColour = [20, 20, 20];   // body fill fallback when humanImg is absent


    // ============================================================
    //  STATE MACHINE
    //
    //  Each state is a row of visual/behaviour targets.
    //  Add a new state here, then add one condition in getState().
    // ============================================================

    const STATES = {
        //            bounce      shake     opacity
        happy:      { bounceAmt: 0.04, shakeAmt: 0.0, alphaTarget: 255 },
        neutral:    { bounceAmt: 0.02, shakeAmt: 0.0, alphaTarget: 180 },
        distressed: { bounceAmt: 0.01, shakeAmt: 1.5, alphaTarget: 127 },
        excited:    { bounceAmt: 0.10, shakeAmt: 0.0, alphaTarget: 255 },
    };

    // First match wins — checked top to bottom every frame.
    function getState(c) {
        if (c.exciteTimer > 0) return 'excited';
        if (c.need <= 30)      return 'happy';
        if (c.need <= 70)      return 'neutral';
        return 'distressed';
    }


    // ============================================================
    //  CREATURE FACTORY
    // ============================================================

    function createCreature(x, y) {
        return {
            x, y,
            need:  50,
            state: 'neutral',
            bounceAmt: 0.02,
            bodyAlpha: 255,
            originX: x, originY: y,
            wanderX: 0, wanderY: 0,
            wanderTargetX: 0, wanderTargetY: 0,
            wanderChangeTimer: 0,
            exciteTimer: 0,
            orbitAngle:  0,
            breathe: 0,
            bob:     0,
            hour:    new Date().getHours(),
            isWatched: true,
            micLevel:  0,
            lastVisit:   null,
            totalVisits: 0,
            sizeScale:   1.0,
            sizeTarget:  1.0,
        };
    }

    let creature;
    let micAnalyser = null;
    let micActive   = false;
    let micData     = null;   // reused buffer — allocated once when mic starts

    // ============================================================
    //  TRAIL
    // ============================================================

    let SHOW_TRAIL  = false;
    let trailPoints = [];
    let trailHue    = 0;
    const TRAIL_MAX = 120;

    function recordTrail(c) {
        trailHue = (trailHue + 1.2) % 360;
        trailPoints.push({ x: c.x, y: c.y, hue: trailHue });
        if (trailPoints.length > TRAIL_MAX) trailPoints.shift();
    }

    function drawTrail() {
        if (trailPoints.length < 2) return;
        p.colorMode(p.HSB, 360, 100, 100, 255);
        p.noStroke();
        for (let i = 0; i < trailPoints.length; i++) {
            let t    = i / trailPoints.length;   // 0 = oldest → 1 = newest
            let pt   = trailPoints[i];
            let alpha = t * 200;
            let size  = t * 14 + 2;
            p.fill(pt.hue, 75, 95, alpha);
            p.circle(pt.x, pt.y, size);
        }
        p.colorMode(p.RGB, 255);
    }

    // ============================================================
    //  MINI MODE & PAINT LAYER
    // ============================================================

    let miniMode        = false;
    let paintLayer      = null;
    let paintPrevX      = null;
    let paintPrevY      = null;
    let paintLayerDirty = false;   // true only when paintLayer has content

    // Paint line settings
    let LINE_STYLE = 'solid';    // 'solid' | 'dashed' | 'dotted' | 'dot-dash'
    let LINE_COLOR = 'rainbow';  // 'rainbow' | css hex string
    let LINE_WIDTH = 2;

    const DASH_PATTERNS = {
        solid:    [],
        dashed:   [14, 7],
        dotted:   [2,  7],
        'dot-dash': [14, 5, 2, 5],
    };

    function initPaintLayer(w, h) {
        paintLayer = p.createGraphics(w, h);
        paintLayer.noFill();
        paintPrevX = null;
        paintPrevY = null;
    }

    function drawPaintMark(c) {
        if (paintPrevX === null) {
            paintPrevX = c.x; paintPrevY = c.y; return;
        }
        // skip if creature teleported (mode switch / excited recovery)
        if (Math.hypot(c.x - paintPrevX, c.y - paintPrevY) > 80) {
            paintPrevX = c.x; paintPrevY = c.y; return;
        }

        // apply dash pattern via raw canvas context
        let ctx = paintLayer.drawingContext;
        ctx.setLineDash(DASH_PATTERNS[LINE_STYLE] || []);

        // colour
        if (LINE_COLOR === 'rainbow') {
            trailHue = (trailHue + 1.5) % 360;
            paintLayer.colorMode(paintLayer.HSB, 360, 100, 100);
            paintLayer.stroke(trailHue, 80, 90);
            paintLayer.colorMode(paintLayer.RGB, 255);
        } else {
            paintLayer.stroke(LINE_COLOR);
        }

        paintLayer.strokeWeight(LINE_WIDTH);
        paintLayer.line(paintPrevX, paintPrevY, c.x, c.y);
        paintLayerDirty = true;

        paintPrevX = c.x;
        paintPrevY = c.y;
    }

    // ============================================================
    //  IDLE MOVEMENT MODE
    // ============================================================

    let MOVE_MODE   = 'off';   // 'off' | 'random' | 'grid' | 'arc'
    let idleTimer   = 0;
    let arcAngle    = 0;
    let gridPhase   = 'h';     // 'h' = move horizontally first, 'v' = vertically

    function updateIdleMovement(c) {
        let pad  = miniMode ? CREATURE_SIZE * 0.1 : CREATURE_SIZE * 0.7;
        let maxX = p.width  / 2 - pad;
        let maxY = p.height / 2 - pad;
        maxX = Math.max(maxX, 10);
        maxY = Math.max(maxY, 10);

        if (MOVE_MODE === 'off') {
            c.wanderTargetX = 0;
            c.wanderTargetY = 0;
            return;
        }

        if (MOVE_MODE === 'random') {
            // slow noise evolution → gradual direction drift instead of jittery turns
            let t  = p.frameCount * 0.004;
            let nx = (p.noise(t,        0.0) - 0.5) * 2;
            let ny = (p.noise(0.0, t + 5.3) - 0.5) * 2;
            c.wanderTargetX = p.constrain(c.wanderTargetX + nx * 2.5, -maxX, maxX);
            c.wanderTargetY = p.constrain(c.wanderTargetY + ny * 2.5, -maxY, maxY);
        }

        if (MOVE_MODE === 'grid') {
            idleTimer--;
            if (idleTimer <= 0) {
                if (gridPhase === 'h') {
                    c.wanderTargetX = p.random(-maxX, maxX);
                    c.wanderTargetY = c.wanderY;   // freeze Y axis
                    gridPhase = 'v';
                } else {
                    c.wanderTargetY = p.random(-maxY, maxY);
                    c.wanderTargetX = c.wanderX;   // freeze X axis
                    gridPhase = 'h';
                }
                // longer wait so creature can ease into position before next turn
                idleTimer = p.floor(p.random(200, 320));
            }
        }

        if (MOVE_MODE === 'arc') {
            arcAngle += 0.003;   // slower traversal along the Lissajous path
            c.wanderTargetX = Math.cos(arcAngle)       * maxX * 0.8;
            c.wanderTargetY = Math.sin(arcAngle * 1.6) * maxY * 0.8;
        }
    }

    // Cached DOM refs — populated in setup, never queried again
    let ui = {};


    // ============================================================
    //  SETUP
    // ============================================================

    function canvasSize() {
        return { w: window.innerWidth, h: window.innerHeight };
    }

    // ============================================================
    //  WEAPONS  — add your image filenames here
    // ============================================================

    // ★ Put weapon images inside a "weapons/" folder next to index.html
    // ★ Add / remove entries freely — the slot will pick randomly
    const WEAPON_PATHS = [
        'image/sword.png',
        'image/wand.png',
        'image/hammer.png',
        'image/shield.png',
        'image/Orb.png',
        'image/dagger.png',
    ];

    let weaponImgs   = [];
    let weaponNames  = [];
    let currentWeapons = [];   // array of 2 indices, [] = none

    // ── Combo comments ────────────────────────────────────────
    const WEAPON_COMBOS = {
        // same weapon × 2
        'sword+sword':   ['Dual swords? Bold. Reckless. Iconic.', 'Two swords, zero chill, maximum commitment.'],
        'wand+wand':     ['Two wands? Running low on ideas?', 'Double casting. Double the chance of blowing yourself up.'],
        'hammer+hammer': ['Dual hammers?! Are your arms okay?', 'Subtlety has left the chat.'],
        'shield+shield': ['Two shields... so you plan to do nothing?', 'Unbreakable defence. Also unbreakable boredom.'],
        'Orb+Orb':       ['Juggling orbs now? Very impressive.', 'Double the orbs, double the existential crisis.'],
        'dagger+dagger': ['Dual daggers — a classic rogue setup!', "One wasn't enough, huh? Fair."],
        // good combos
        'shield+sword':  ['Classic hero loadout. 10/10.', 'Sword and shield — timeless, reliable, unstoppable.'],
        'Orb+wand':      ['Full mage kit! Mana levels: over 9000.', 'The ultimate spellcaster combo. Very classy.'],
        'dagger+sword':  ['Main hand, off hand — assassin mode!', 'Sword for show, dagger for the real work.'],
        'hammer+shield': ['Tank build. You shall not pass.', 'Sturdy and devastating. Warrior approved.'],
        'dagger+Orb':    ['Rogue + magic orb? Sneaky AND sparkly.', 'Stab first, cast later. Efficient.'],
        'dagger+wand':   ['Close range stab, long range zap. Smart.', 'The rogue-mage hybrid nobody asked for but everyone needs.'],
        // bad / funny combos
        'hammer+wand':   ['Hammer AND wand? Pick a lane.', 'Smash it or zap it — why not both, I guess.'],
        'dagger+hammer': ['Precision meets brute force. Chaotically.', 'One for finesse, one for rage. Balanced? No.'],
        'dagger+shield': ['Assassin with a shield? Identity crisis.', 'Stealth mode with extra bulk. Interesting choice.'],
        'shield+wand':   ['Cast spells from behind a shield? Cowardly. Effective.', 'Defensive mage arc. Surprisingly valid.'],
        'Orb+shield':    ['Hiding behind a shield lobbing orbs?', "That's... actually kind of genius. Annoying, but genius."],
        'hammer+Orb':    ['Hammer meets magic orb. Pure chaos.', 'Physical devastation plus arcane confusion. Bold.'],
        'sword+wand':    ['Warrior-mage hybrid. Unstoppable or confused?', 'Slash then zap. The enemies will be very puzzled.'],
        'hammer+sword':  ['A sword AND a hammer? Pick up day at the forge?', 'Heavy, heavier. Your poor wrists.'],
        'Orb+sword':     ['Warrior carrying a glowing orb into battle.', 'Nothing says "fear me" like a sword and a mysterious ball.'],
    };

    const COMBO_DEFAULT = [
        'Interesting combo... very unique.', 'Bold choice. No further questions.', "I don't understand this loadout but I respect it."
    ];

    function getComboKey(n1, n2) {
        return n1 === n2 ? `${n1}+${n1}` : [n1, n2].sort().join('+');
    }

    let slotImgs    = {};   // keyed image icons for HUD slots
    let monsterImgs = {};   // monster type images: monsterImgs[1/2/3]
    let humanImg    = null;
    let backgroundImg = null;
    let bgLayer       = null;  // pre-scaled to canvas size — blitted each frame with no scaling

    p.preload = function() {
        WEAPON_PATHS.forEach((path, i) => {
            weaponNames[i] = path.split('/').pop().replace(/\.[^.]+$/, '');
            p.loadImage(path,
                img => { weaponImgs[i] = img; },
                ()  => { weaponImgs[i] = null; }
            );
        });
        p.loadImage('image/HP_Potion.png',   img => { slotImgs.potion = img; }, () => {});
        p.loadImage('image/sword.png',       img => { slotImgs.sword  = img; }, () => {});
        p.loadImage('image/water_magic.png', img => { slotImgs.water  = img; }, () => {});
        p.loadImage('image/fair_magic.png',  img => { slotImgs.fire   = img; }, () => {});
        p.loadImage('image/monster_1.png', img => { monsterImgs[1] = img; }, () => {});
        p.loadImage('image/monster_2.png', img => { monsterImgs[2] = img; }, () => {});
        p.loadImage('image/monster_3.png', img => { monsterImgs[3] = img; }, () => {});
        p.loadImage('image/human.png',       img => { humanImg     = img; }, () => {});
        p.loadImage('image/background.png', img => { backgroundImg = img; }, () => {});
    };

    function randomWeapon() {
        let available = WEAPON_PATHS.map((_, i) => i).filter(i => weaponImgs[i]);
        if (available.length === 0) {
            spawnFloat(creature.x, creature.y - 20, '没有武器！', [255, 120, 120]);
            return;
        }
        // pick 2 independently (same is allowed)
        let w1 = available[Math.floor(p.random(available.length))];
        let w2 = available[Math.floor(p.random(available.length))];
        currentWeapons = [w1, w2];
        updateWeaponSlots();

        // show combo comment via dialog bubble
        let key      = getComboKey(weaponNames[w1], weaponNames[w2]);
        let comments = WEAPON_COMBOS[key] || COMBO_DEFAULT;
        rpgDialog = {
            text:    comments[Math.floor(p.random(comments.length))],
            life:    260,
            maxLife: 260,
        };
        rpgDialogTimer = 120;
    }

    function _drawOneWeapon(c, img, side) {
        let wSize = CREATURE_SIZE * c.sizeScale * 1.0;
        let wx    = c.x + side * (CREATURE_SIZE * c.sizeScale * 0.42 + wSize * 0.18);
        let wy    = c.y + CREATURE_SIZE * c.sizeScale * 0.08;
        p.push();
        p.translate(wx, wy);
        if (side < 0) p.scale(-1, 1);
        p.rotate(-0.35 + p.sin(c.bob * 0.7) * 0.06);
        p.imageMode(p.CENTER);
        p.image(img, 0, 0, wSize, wSize);
        p.pop();
    }

    function drawWeapon(c) {
        if (currentWeapons.length === 0) return;
        let img0 = weaponImgs[currentWeapons[0]];
        let img1 = weaponImgs[currentWeapons[1]];
        if (img0) _drawOneWeapon(c, img0,  1);
        if (img1) _drawOneWeapon(c, img1, -1);
    }


    // ============================================================
    //  BATTLE MODE  —  monsters spawn and creature hunts them
    // ============================================================

    let BATTLE_MODE           = false;
    let monsters              = [];
    let monsterSpawnTimer     = 0;
    let attackTimer           = 0;

    const IDLE_TIMEOUT        = 30000;  // ms before auto-battle
    let   lastInteractionTime = 0;      // set in setup
    let   autoBattleActive    = false;

    const MONSTER_SPAWN_INTERVAL = 180;   // frames between spawns
    const MAX_MONSTERS           = 5;
    const ATTACK_RANGE           = 70;    // px — creature melee reach
    const ATTACK_COOLDOWN        = 28;    // frames between swings
    const AGGRO_RADIUS           = 220;   // px from screen center — monsters only chase inside this
    const WATER_RANGE            = 260;   // px — max range for water spell
    const FIRE_RANGE             = 520;   // px — max range for fire spell

    // Base damage per weapon — stacks when two are equipped
    const WEAPON_DAMAGE = {
        sword: 12, wand: 8, hammer: 18, shield: 3, Orb: 10, dagger: 9,
    };

    // Each weapon's specialty stat bonus (display + effect)
    const WEAPON_STAT_BONUS = {
        sword:  { stat: 'atk',  display: '+12',    col: [255, 100,  80] },
        hammer: { stat: 'atk',  display: '+18',    col: [255, 155,  60] },
        dagger: { stat: 'spd',  display: '+0.8',   col: [100, 235, 165] },
        shield: { stat: 'def',  display: '+8%',    col: [ 80, 185, 255] },
        Orb:    { stat: 'mp',   display: '+regen',  col: [155, 110, 255] },
        wand:   { stat: 'atk',  display: '+✦',     col: [195, 135, 255] },
    };

    function getWeaponDamage() {
        if (currentWeapons.length === 0) return 4;   // bare hands
        let bonus = 0;
        for (let idx of currentWeapons) bonus += WEAPON_DAMAGE[weaponNames[idx]] || 5;
        return bonus;
    }

    // ── Player stats (derived from level) ────────────────────────
    function playerMaxHp()   { return 100 + (rpgLevel() - 1) * 10; }
    function playerAtk()     { return 10  + (rpgLevel() - 1) * 1;  }
    function playerSpd()     { return 0.04 + (rpgLevel() - 1) * 0.003; }
    function playerMaxMana() { return 60  + (rpgLevel() - 1) * 8;  }
    function playerDef() {
        const lv = rpgLevel();
        return lv <= 10 ? lv * 1.0 : 10 + (lv - 10) * 0.5;
    }  // base % damage reduction from level only

    // Totals used in combat — include weapon bonuses
    function playerDefTotal() {
        let def = playerDef();
        for (const idx of currentWeapons) {
            if (idx !== undefined && weaponNames[idx] === 'shield') def += 8;
        }
        return def;
    }
    function playerSpdTotal() {
        let spd = playerSpd();
        for (const idx of currentWeapons) {
            if (idx !== undefined && weaponNames[idx] === 'dagger') spd += 0.008;
        }
        return spd;
    }

    // ── Monster tier definitions ──────────────────────────────────
    // tier: 1=Normal  2=Elite  3=Boss
    const MONSTER_BASE = [
        { tier: 1, label: 'Normal', baseHp: 30,  baseRadius: 15, speed: 1.4, xpBase: 3,  dmgBase: 8,  col: [200,200,200] },
        { tier: 2, label: 'Elite',  baseHp: 70,  baseRadius: 24, speed: 0.9, xpBase: 8,  dmgBase: 15, col: [255,200,60]  },
        { tier: 3, label: 'Boss',   baseHp: 160, baseRadius: 52, speed: 0.5, xpBase: 18, dmgBase: 25, col: [255,80,80]   },
    ];

    // How many of each tier can appear per level bracket [Normal, Elite, Boss]
    // Boss reaches 50% at lv 100
    function tierWeights(lv) {
        if (lv <= 3)   return [10, 2,  0];  // boss  0%
        if (lv <= 8)   return [ 7, 4,  1];  // boss  8%
        if (lv <= 15)  return [ 5, 5,  2];  // boss 17%
        if (lv <= 25)  return [ 4, 5,  3];  // boss 25%
        if (lv <= 40)  return [ 3, 5,  4];  // boss 33%
        if (lv <= 60)  return [ 2, 5,  5];  // boss 42%
        if (lv <= 100) return [ 1, 4,  5];  // boss 50%
        return                [ 0, 4,  6];  // boss 60%
    }

    function scaledMonsterDef(lv, noBoss = false) {
        // pick tier by weighted random; noBoss=true redirects boss weight to Normal/Elite
        const w = tierWeights(lv).slice();
        if (noBoss) w[2] = 0;
        const total = w.reduce((a,b) => a+b, 0);
        let roll  = p.random(total), cumul = 0, base = MONSTER_BASE[0];
        for (let i = 0; i < MONSTER_BASE.length; i++) {
            cumul += w[i];
            if (roll < cumul) { base = MONSTER_BASE[i]; break; }
        }
        const lvMult  = 1 + (lv - 1) * 0.18;
        const sizeVar = p.random(0.75, 1.35);
        const radius  = Math.round((base.baseRadius + (lv - 1) * (base.tier * 0.8)) * sizeVar);
        const maxHp   = Math.round(base.baseHp * lvMult * (radius / base.baseRadius));
        const dmg     = Math.round(base.dmgBase * (1 + (lv - 1) * 0.12));
        const xp      = base.xpBase + (lv - 1) * base.tier;
        return { tier: base.tier, label: base.label, col: base.col,
                 type: base.tier, maxHp, speed: base.speed, radius, xpReward: xp, dmgToPlayer: dmg };
    }

    function spawnMonster() {
        const bossAlive = monsters.some(m => m.alive && m.tier === 3);
        let def  = scaledMonsterDef(rpgLevel(), bossAlive);
        let edge = Math.floor(p.random(4));
        let mx, my;
        if      (edge === 0) { mx = p.random(p.width);        my = -def.radius - 10; }
        else if (edge === 1) { mx = p.random(p.width);        my = p.height + def.radius + 10; }
        else if (edge === 2) { mx = -def.radius - 10;         my = p.random(p.height); }
        else                 { mx = p.width + def.radius + 10; my = p.random(p.height); }
        monsters.push({
            x: mx, y: my, type: def.type,
            tier: def.tier, label: def.label, col: def.col,
            hp: def.maxHp, maxHp: def.maxHp,
            speed: def.speed, radius: def.radius,
            xpReward: def.xpReward, dmgToPlayer: def.dmgToPlayer,
            alive: true, deathTimer: 0,
            aggroed: false,
        });
    }

    function getBattleTarget(c) {
        let nearest = null, nearestDist = Infinity;
        for (let m of monsters) {
            if (!m.alive || !m.aggroed) continue;
            let d = p.dist(c.x, c.y, m.x, m.y);
            if (d < nearestDist) { nearestDist = d; nearest = m; }
        }
        return nearest;
    }

    function updateSpells(c) {
        if (!BATTLE_MODE) return;

        // Mana regeneration — Orb boosts rate
        let manaRegen = 0.12;
        for (const idx of currentWeapons) {
            if (idx !== undefined && weaponNames[idx] === 'Orb') manaRegen += 0.10;
        }
        playerMana = Math.min(playerMaxMana(), playerMana + manaRegen);

        waterCooldown = Math.max(0, waterCooldown - 1);
        fireCooldown  = Math.max(0, fireCooldown  - 1);

        const lv = rpgLevel();

        // Each spell has its own max range — find nearest target within that range
        let fireTarget = null, fireBest = Infinity;
        let waterTarget = null, waterBest = Infinity;
        for (let m of monsters) {
            if (!m.alive) continue;
            const d = p.dist(c.x, c.y, m.x, m.y);
            if (d < FIRE_RANGE  && d < fireBest)  { fireBest  = d; fireTarget  = m; }
            if (d < WATER_RANGE && d < waterBest) { waterBest = d; waterTarget = m; }
        }

        if (lv >= 10 && fireCooldown === 0 && playerMana >= 25 && fireTarget) {
            castSpell(c, fireTarget, 'fire');
            playerMana  -= 25;
            fireCooldown = 90;
        } else if (lv >= 5 && waterCooldown === 0 && playerMana >= 15 && waterTarget) {
            if (lv < 10 || fireCooldown > 0) {
                castSpell(c, waterTarget, 'water');
                playerMana   -= 15;
                waterCooldown = 55;
            }
        }

        // Move spells + hit detection
        for (let s of spells) {
            s.x += s.dx;
            s.y += s.dy;
            s.life--;
            if (s.life <= 0) continue;
            for (let m of monsters) {
                if (!m.alive) continue;
                if (p.dist(s.x, s.y, m.x, m.y) < m.radius + 8) {
                    m.hp -= s.dmg;
                    const fc = s.type === 'fire' ? [255, 140, 40] : [80, 180, 255];
                    spawnFloat(m.x, m.y - m.radius - 10, `-${s.dmg}`, fc);
                    s.life = 0;
                    if (m.hp <= 0) {
                        m.alive = false; m.deathTimer = 40;
                        const prevLv = rpgLevel();
                        rpgFeeds += m.xpReward;
                        const needDmg = Math.round(m.dmgToPlayer * (1 - playerDefTotal() / 100) * 60 / playerMaxHp());
                        c.need = p.min(100, c.need + needDmg);
                        spawnFloat(c.x, c.y - 30, `+${m.xpReward} XP`, [255, 210, 60]);
                        spawnFloat(c.x, c.y - 52, `-${needDmg} HP`, [255, 100, 80]);
                        if (rpgLevel() > prevLv) {
                            spawnFloat(c.x, c.y - 76, '✦ LEVEL UP! ✦',     [255, 210, 60]);
                            spawnFloat(c.x, c.y - 98, '+10HP +1ATK +1SPD', [180, 240, 180]);
                        }
                    }
                    break;
                }
            }
        }
        spells = spells.filter(s => s.life > 0);
    }

    function castSpell(c, target, type) {
        const isFire = type === 'fire';
        const speed  = isFire ? 5.5 : 3.5;
        const life   = isFire ? Math.ceil(FIRE_RANGE  / speed)   // ~95 frames
                              : Math.ceil(WATER_RANGE / speed);  // ~75 frames
        const dmg    = isFire
            ? Math.round(playerAtk() * 2.2 + p.random(8))
            : Math.round(playerAtk() * 1.4 + p.random(4));
        const dx = target.x - c.x, dy = target.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        spells.push({ x: c.x, y: c.y, dx: dx / len * speed, dy: dy / len * speed,
                      type, dmg, life, maxLife: life });
        // Wand bonus: extra projectile at ~14° offset
        const hasWand = currentWeapons.some(i => i !== undefined && weaponNames[i] === 'wand');
        if (hasWand) {
            const angle = Math.atan2(dy, dx) + 0.24;
            spells.push({ x: c.x, y: c.y,
                          dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed,
                          type, dmg: Math.round(dmg * 0.65), life, maxLife: life });
        }
    }

    function drawSpells() {
        for (let s of spells) {
            const t   = s.life / s.maxLife;
            const img = s.type === 'fire' ? slotImgs.fire : slotImgs.water;
            const sz  = s.type === 'fire' ? 34 : 28;
            p.push();
            p.drawingContext.globalAlpha = Math.min(1, t * 2) * 0.9;
            p.imageMode(p.CENTER);
            if (img) {
                p.image(img, s.x, s.y, sz, sz);
            } else {
                p.noStroke();
                p.fill(s.type === 'fire' ? [255, 120, 40] : [80, 180, 255]);
                p.circle(s.x, s.y, sz * 0.6);
            }
            p.pop();
        }
    }

    function updateMonsters(c) {
        if (!BATTLE_MODE) return;

        // Spawn
        monsterSpawnTimer++;
        if (monsterSpawnTimer >= MONSTER_SPAWN_INTERVAL &&
            monsters.filter(m => m.alive).length < MAX_MONSTERS) {
            spawnMonster();
            monsterSpawnTimer = 0;
        }

        // Move alive monsters; aggro triggers on entering center radius
        const cx = p.width / 2, cy = p.height / 2;
        for (let m of monsters) {
            if (!m.alive) { m.deathTimer--; continue; }
            const distToCenter = Math.hypot(m.x - cx, m.y - cy);
            if (!m.aggroed && distToCenter <= AGGRO_RADIUS) m.aggroed = true;
            if (m.aggroed) {
                // chase creature at full speed
                let dx = c.x - m.x, dy = c.y - m.y;
                let d  = Math.hypot(dx, dy) || 1;
                m.x += (dx / d) * m.speed;
                m.y += (dy / d) * m.speed;
            } else {
                // drift toward screen center at half speed
                let dx = cx - m.x, dy = cy - m.y;
                let d  = Math.hypot(dx, dy) || 1;
                m.x += (dx / d) * m.speed * 0.5;
                m.y += (dy / d) * m.speed * 0.5;
            }
        }

        // Creature attacks nearest monster within range
        attackTimer = Math.max(0, attackTimer - 1);
        if (attackTimer === 0) {
            let nearest = getBattleTarget(c);
            if (nearest) {
                let d = p.dist(c.x, c.y, nearest.x, nearest.y);
                if (d <= ATTACK_RANGE + nearest.radius) {
                    let weapDmg = getWeaponDamage();
                    let dmg     = playerAtk() + weapDmg + Math.floor(p.random(weapDmg * 0.5 + 1));
                    nearest.hp -= dmg;
                    spawnFloat(nearest.x, nearest.y - nearest.radius - 10,
                               `-${dmg}`, [255, 80, 80]);
                    attackTimer = ATTACK_COOLDOWN;

                    if (nearest.hp <= 0) {
                        nearest.alive      = false;
                        nearest.deathTimer = 40;
                        let prevLv = rpgLevel();
                        rpgFeeds  += nearest.xpReward;
                        // damage scaled by player max HP — more HP = less % damage per hit
                        let needDmg = Math.round(nearest.dmgToPlayer * (1 - playerDefTotal() / 100) * 100 / playerMaxHp());
                        c.need  = p.min(100, c.need + needDmg);
                        spawnFloat(c.x, c.y - 30, `+${nearest.xpReward} XP`,  [255, 210, 60]);
                        spawnFloat(c.x, c.y - 52, `-${needDmg} HP`, [255, 100, 80]);
                        if (rpgLevel() > prevLv) {
                            spawnFloat(c.x, c.y - 76, '✦ LEVEL UP! ✦',       [255, 210, 60]);
                            spawnFloat(c.x, c.y - 98, '+10HP +1ATK +1SPD',   [180, 240, 180]);
                        }
                    }
                }
            }
        }

        // Remove fully expired dead monsters
        monsters = monsters.filter(m => m.alive || m.deathTimer > 0);
    }

    function drawMonsters() {
        for (let m of monsters) {
            if (!m.alive && m.deathTimer <= 0) continue;
            let t     = m.alive ? 1 : m.deathTimer / 40;
            let alpha = t * 255;
            let sc    = m.alive ? 1 : 1 + (1 - t) * 0.6;
            let size  = m.radius * 2.5;

            p.push();
            p.translate(m.x, m.y);
            p.scale(sc);

            p.drawingContext.globalAlpha = alpha / 255;
            let img = monsterImgs[m.type];
            if (img) {
                p.imageMode(p.CENTER);
                p.image(img, 0, 0, size, size);
            } else {
                p.noStroke();
                p.fill(200, 60, 60, alpha);
                p.circle(0, 0, size);
            }

            // HP bar + tier label
            if (m.alive) {
                let barW  = size * 0.9;
                let barH  = 5;
                let barYm = -m.radius * 1.55;
                let hpRat = m.hp / m.maxHp;
                const col = m.col || [220, 50, 50];

                // tier label above bar
                p.drawingContext.globalAlpha = 0.85;
                p.noStroke();
                p.textAlign(p.CENTER, p.BOTTOM);
                p.textSize(Math.max(8, m.radius * 0.22));
                p.fill(col[0], col[1], col[2], 220);
                p.text(m.label || '', 0, barYm - 2);

                // bar background
                p.noStroke();
                p.fill(20, 10, 10, 200);
                p.rect(-barW / 2, barYm, barW, barH, 2);
                // bar fill — color by tier
                p.fill(col[0], col[1], col[2], 220);
                p.rect(-barW / 2, barYm, barW * hpRat, barH, 2);
            }

            p.pop();
        }
    }

    function checkIdleBattle() {
        if (autoBattleActive || BATTLE_MODE) return;
        if (p.millis() - lastInteractionTime >= IDLE_TIMEOUT) {
            autoBattleActive = true;
            BATTLE_MODE      = true;
            monsterSpawnTimer = MONSTER_SPAWN_INTERVAL - 60;
            updateBattleBtn();
        }
    }

    function onUserActivity() {
        lastInteractionTime = p.millis();   // keeps the 30s idle timer alive
    }

    function cancelAutoBattle() {
        if (!autoBattleActive) return;
        autoBattleActive  = false;
        BATTLE_MODE       = false;
        monsters          = [];
        spells            = [];
        monsterSpawnTimer = 0;
        attackTimer       = 0;
        updateBattleBtn();
        if (creature) {
            rpgDialog = { text: 'You left me to fight alone?!', life: 260, maxLife: 260 };
            rpgDialogTimer = 160;
        }
    }

    function toggleBattleMode() {
        BATTLE_MODE = !BATTLE_MODE;
        if (!BATTLE_MODE) {
            monsters          = [];
            spells            = [];
            monsterSpawnTimer = 0;
            attackTimer       = 0;
        } else {
            // First monster spawns quickly
            monsterSpawnTimer = MONSTER_SPAWN_INTERVAL - 60;
        }
        updateBattleBtn();
    }


    p.setup = function() {
        p.pixelDensity(1);          // use 1:1 pixels — avoids 2× overdraw on HiDPI/scaled displays
        let sz  = canvasSize();
        let cnv = p.createCanvas(sz.w, sz.h);
        cnv.parent('canvas-container');
        cnv.mousePressed(onCanvasClick);

        rebuildBgLayer();

        creature = createCreature(p.width / 2, p.height / 2);
        loadState(creature);

        if (!SHOW_UI) document.querySelector('.sidebar').style.display = 'none';

        // Cache sidebar DOM refs once — no per-frame getElementById calls
        ui.hour    = document.getElementById('ui-hour');
        ui.min     = document.getElementById('ui-min');
        ui.period  = document.getElementById('ui-period');
        ui.state   = document.getElementById('ui-state');
        ui.needVal = document.getElementById('ui-need-val');
        ui.needBar    = document.getElementById('ui-need-bar');
        ui.hearts     = document.getElementById('rpg-hearts-row');
        ui.lvEl       = document.getElementById('ui-rpg-lv');
        ui.xpEl       = document.getElementById('ui-rpg-xp');
        ui.xpFill     = document.getElementById('ui-rpg-xp-fill');
        ui.hpEl       = document.getElementById('stat-hp');
        ui.mpEl       = document.getElementById('stat-mp');
        ui.atkEl      = document.getElementById('stat-atk');
        ui.spdEl      = document.getElementById('stat-spd');
        ui.defEl      = document.getElementById('stat-def');
        ui.mpBonus    = document.getElementById('stat-mp-bonus');
        ui.atkBonus   = document.getElementById('stat-atk-bonus');
        ui.spdBonus   = document.getElementById('stat-spd-bonus');
        ui.defBonus   = document.getElementById('stat-def-bonus');
        ui.skillLockW = document.getElementById('skill-lock-water');
        ui.skillLockF = document.getElementById('skill-lock-fire');
        ui.skillCdW   = document.getElementById('skill-cd-water');
        ui.skillCdF   = document.getElementById('skill-cd-fire');
        ui.skillSlotW = document.getElementById('skill-slot-water');
        ui.skillSlotF = document.getElementById('skill-slot-fire');

        // Track focus via events — no polling in the draw loop
        window.addEventListener('focus', () => { creature.isWatched = true; });
        window.addEventListener('blur',  () => { creature.isWatched = false; });

        // Idle auto-battle tracking
        lastInteractionTime = p.millis();
        window.addEventListener('mousemove', onUserActivity);
        window.addEventListener('keydown',   onUserActivity);

        initPaintLayer(sz.w, sz.h);
        initHudSlots();
   // set once — never changed per-frame

        setInterval(() => { saveState(creature); creature.hour = new Date().getHours(); }, 30000);
        window.addEventListener('beforeunload', () => saveState(creature));

        fetchWeather();
        setInterval(fetchWeather, 30 * 60 * 1000);

        fetchTime();
        setInterval(updateClock, 1000);
    };


    // ============================================================
    //  DRAW LOOP
    // ============================================================

    let currentWeatherCode = -1;  // -1 = not yet fetched

    // time-of-day palette: c=[r,g,b], a=alpha (lower = more ghost/trail)
    const TIME_PALETTE = [
        { h:  0, c: [12,  14,  38],  a: 210 },  // midnight — deep navy
        { h:  5, c: [28,  22,  58],  a: 215 },  // pre-dawn — soft indigo
        { h:  6, c: [95,  72,  95],  a: 230 },  // dawn — dusty mauve
        { h:  7, c: [175, 135, 120], a: 240 },  // sunrise — rose-peach
        { h:  9, c: [195, 210, 215], a: 255 },  // morning — cool mist
        { h: 12, c: [208, 228, 218], a: 255 },  // midday — pale sage
        { h: 15, c: [215, 220, 205], a: 255 },  // afternoon — warm cream
        { h: 17, c: [200, 170, 125], a: 250 },  // golden hour — muted amber
        { h: 19, c: [150, 100, 100], a: 238 },  // sunset — dusty rose
        { h: 20, c: [75,  58,  98],  a: 222 },  // dusk — soft violet
        { h: 22, c: [22,  18,  52],  a: 210 },  // night — dark indigo
        { h: 24, c: [12,  14,  38],  a: 210 },  // wrap to midnight
    ];

    // weather colour offset [dr, dg, db, da]
    function weatherTint(code) {
        if (code < 0)   return [0,   0,   0,   0  ];  // not fetched
        if (code === 0) return [8,   4,  -6,   5  ];  // clear — warmer, brighter
        if (code <= 3)  return [-8,  -6,   4,  -8  ];  // cloudy — grey
        if (code <= 48) return [-12, -10,  8, -18  ];  // foggy — cool grey, faded
        if (code <= 55) return [-18, -14,  12, -25 ];  // drizzle — dark cool
        if (code <= 65) return [-30, -22,  18, -35 ];  // rain — dark blue-grey
        if (code <= 75) return [15,  18,  25,  -10 ];  // snow — cold, bright
        if (code <= 82) return [-35, -28,  14, -40 ];  // showers — heavy dark
        return                 [-45, -35,  10, -50 ];  // storm — very dark
    }

    function timeBg(hour) {
        let a = TIME_PALETTE[0], b = TIME_PALETTE[TIME_PALETTE.length - 1];
        for (let i = 0; i < TIME_PALETTE.length - 1; i++) {
            if (hour >= TIME_PALETTE[i].h && hour < TIME_PALETTE[i + 1].h) {
                a = TIME_PALETTE[i]; b = TIME_PALETTE[i + 1]; break;
            }
        }
        const t    = (hour - a.h) / (b.h - a.h);
        const base = a.c.map((v, i) => v + (b.c[i] - v) * t);
        const alph = a.a + (b.a - a.a) * t;
        const tint = weatherTint(currentWeatherCode);
        const clamp = v => Math.round(Math.max(0, Math.min(255, v)));
        return [...base.map((v, i) => clamp(v + tint[i])), clamp(alph + tint[3])];
    }

    function rebuildBgLayer() {
        if (!backgroundImg) return;
        if (bgLayer) bgLayer.remove();
        bgLayer = p.createGraphics(p.width, p.height);
        bgLayer.image(backgroundImg, 0, 0, p.width, p.height);
    }

    p.draw = function() {
        const hour = creature ? creature.hour + new Date().getMinutes() / 60 : 12;
        const [tr, tg, tb, ta] = timeBg(hour);

        // Background: pre-scaled buffer (same-size blit, no per-frame scaling)
        if (bgLayer) {
            p.image(bgLayer, 0, 0);
        } else {
            p.background(tr, tg, tb);
        }
        // Time-of-day colour overlay
        const overlayAlpha = Math.round(p.map(ta, 210, 255, 160, 45));
        p.noStroke();
        p.fill(tr, tg, tb, overlayAlpha);
        p.rect(0, 0, p.width, p.height);

        checkIdleBattle();
        updateMic(creature);
        updateCreature(creature);
        if (paintLayerDirty) p.image(paintLayer, 0, 0);
        if (SHOW_TRAIL) { recordTrail(creature); drawTrail(); }
        if (miniMode && !BATTLE_MODE) drawPaintMark(creature);
        updateMonsters(creature);
        updateSpells(creature);
        drawMonsters();
        drawSpells();
        drawCreature(creature);
        drawWeapon(creature);
        drawNameplate(creature);
        tryRpgDialog(creature);
        drawRpgDialog(creature);
        updateDrawFloatNums();
        drawBottomHUD(creature);

        if (p.frameCount % 6 === 0) updateSidebar(creature); // ~10fps is plenty for UI
    };


    // ============================================================
    //  CREATURE LOGIC
    // ============================================================

    function updateCreature(c) {
        // Need rises over time
        let rate = c.isWatched ? DECAY_RATE : AWAY_RATE;
        c.need = p.constrain(c.need + rate, 0, 100);

        // State machine
        c.state = getState(c);
        let s = STATES[c.state];
        c.bounceAmt = p.lerp(c.bounceAmt, s.bounceAmt * BOUNCE_SCALE, 0.08);
        c.bodyAlpha = p.lerp(c.bodyAlpha, s.alphaTarget, 0.05);

        // Size: full when excited, mini when movement or battle mode is active
        let shouldMini = (MOVE_MODE !== 'off' || BATTLE_MODE) && c.exciteTimer === 0;
        c.sizeTarget = shouldMini ? 0.15 : 1.0;
        miniMode     = shouldMini;
        c.sizeScale  = p.lerp(c.sizeScale, c.sizeTarget, 0.1);

        // Animation phases
        c.breathe += 0.018;
        c.bob     += 0.012;

        // Excited: chase mouse (orbit when close), or wander if mouse is off canvas.
        // Calm: drift back to origin.
        if (c.exciteTimer > 0) {
            c.exciteTimer--;
            let mouseOnCanvas = p.mouseX >= 0 && p.mouseX <= p.width &&
                                p.mouseY >= 0 && p.mouseY <= p.height;
            if (mouseOnCanvas) {
                const ORBIT_RADIUS = CREATURE_SIZE * 0.55;
                let distToMouse = p.dist(c.x, c.y, p.mouseX, p.mouseY);
                if (distToMouse > ORBIT_RADIUS * 1.5) {
                    c.wanderTargetX = p.mouseX - c.originX;
                    c.wanderTargetY = p.mouseY - c.originY;
                } else {
                    c.orbitAngle   += 0.025;
                    c.wanderTargetX = (p.mouseX - c.originX) + Math.cos(c.orbitAngle) * ORBIT_RADIUS;
                    c.wanderTargetY = (p.mouseY - c.originY) + Math.sin(c.orbitAngle) * ORBIT_RADIUS;
                }
            } else {
                c.wanderChangeTimer--;
                if (c.wanderChangeTimer <= 0) {
                    let pad = CREATURE_SIZE * 0.6;
                    c.wanderTargetX = p.random(pad, p.width  - pad) - c.originX;
                    c.wanderTargetY = p.random(pad, p.height - pad) - c.originY;
                    c.wanderChangeTimer = p.floor(p.random(30, 70));
                }
            }
        } else {
            if (BATTLE_MODE) {
                let target = getBattleTarget(c);
                if (target) {
                    // Chase the nearest monster, clamped to canvas
                    c.wanderTargetX = p.constrain(target.x - c.originX,
                                                  -c.originX + 20, p.width  - c.originX - 20);
                    c.wanderTargetY = p.constrain(target.y - c.originY,
                                                  -c.originY + 20, p.height - c.originY - 20);
                } else {
                    updateIdleMovement(c);
                }
            } else {
                updateIdleMovement(c);
            }
        }

        // lower lerp = softer easing; battle mode uses fast lerp to track monsters
        let lerpSpeed = BATTLE_MODE          ? playerSpdTotal()
                      : MOVE_MODE === 'random' ? 0.018
                      : MOVE_MODE === 'grid'   ? 0.012
                      : MOVE_MODE === 'arc'    ? 0.022
                      : 0.04;
        c.wanderX = p.lerp(c.wanderX, c.wanderTargetX, lerpSpeed);
        c.wanderY = p.lerp(c.wanderY, c.wanderTargetY, lerpSpeed);
        c.x = c.originX + c.wanderX;
        c.y = c.originY + c.wanderY;
    }


    // ============================================================
    //  DRAWING
    // ============================================================

    function drawCreature(c) {
        p.push();
        p.translate(c.x, c.y);
        p.translate(0, p.sin(c.bob) * 6);

        let s = STATES[c.state];
        let bScale = 1 + p.sin(c.breathe) * c.bounceAmt;

        if (s.shakeAmt > 0) {
            p.translate(
                p.random(-s.shakeAmt, s.shakeAmt),
                p.random(-s.shakeAmt * 0.4, s.shakeAmt * 0.4)
            );
        }

        p.scale(c.sizeScale * bScale);
        if (DECORATIONS.sparkles) drawSparkles();
        drawBody(c);
        if (DECORATIONS.blush)   drawBlush();
        drawEyes(c);
        if (DECORATIONS.hat)     drawHat();
        if (DECORATIONS.crown)   drawCrown();
        if (DECORATIONS.bowtie)  drawBowTie();
        p.pop();
    }


    // ============================================================
    //  DECORATIONS
    // ============================================================

    const DECORATIONS = { hat: false, crown: false, bowtie: false, sparkles: false, blush: false };
    let sparkleAngle = 0;

    function drawHat() {
        let brimW = CREATURE_SIZE * 0.62;
        let brimH = CREATURE_SIZE * 0.09;
        let hatW  = CREATURE_SIZE * 0.38;
        let hatH  = CREATURE_SIZE * 0.44;
        let base  = -CREATURE_SIZE * 0.50;
        p.noStroke();
        p.fill(28, 20, 20);
        p.rect(-hatW / 2, base - hatH, hatW, hatH, 5, 5, 0, 0);
        p.rect(-brimW / 2, base - brimH * 0.6, brimW, brimH, 4);
        p.fill(195, 62, 78);
        p.rect(-hatW / 2, base - hatH * 0.30, hatW, hatH * 0.14);
    }

    function drawCrown() {
        let w  = CREATURE_SIZE * 0.54;
        let h  = CREATURE_SIZE * 0.26;
        let by = -CREATURE_SIZE * 0.50;
        p.noStroke();
        p.fill(255, 200, 20);
        p.beginShape();
        p.vertex(-w / 2, by);
        p.vertex(-w / 2, by - h * 0.55);
        p.vertex(-w * 0.16, by - h * 0.30);
        p.vertex(0,          by - h);
        p.vertex( w * 0.16, by - h * 0.30);
        p.vertex( w / 2, by - h * 0.55);
        p.vertex( w / 2, by);
        p.endShape(p.CLOSE);
        p.fill(255, 65, 65);  p.circle(0,       by - h * 0.85, h * 0.22);
        p.fill(65,  65, 255); p.circle(-w * 0.29, by - h * 0.42, h * 0.17);
        p.fill(65,  65, 255); p.circle( w * 0.29, by - h * 0.42, h * 0.17);
    }

    function drawBowTie() {
        let ty = CREATURE_SIZE * 0.40;
        let bw = CREATURE_SIZE * 0.21;
        let bh = CREATURE_SIZE * 0.12;
        p.push();
        p.translate(0, ty);
        p.noStroke();
        p.fill(210, 55, 55);
        for (let side of [-1, 1]) {
            p.beginShape();
            p.vertex(0,        -bh * 0.28);
            p.vertex(side * bw, -bh);
            p.vertex(side * bw,  bh);
            p.vertex(0,         bh * 0.28);
            p.endShape(p.CLOSE);
        }
        p.fill(165, 35, 35);
        p.ellipse(0, 0, bh * 0.95, bh * 0.95);
        p.pop();
    }

    function drawSparkles() {
        sparkleAngle += 0.022;
        let count  = 5;
        let radius = CREATURE_SIZE * 0.70;
        p.noStroke();
        for (let i = 0; i < count; i++) {
            let a     = sparkleAngle + (p.TWO_PI / count) * i;
            let sx    = Math.cos(a) * radius;
            let sy    = Math.sin(a) * radius;
            let pulse = 0.7 + 0.3 * Math.sin(sparkleAngle * 4 + i * 1.6);
            let sz    = CREATURE_SIZE * 0.10 * pulse;
            p.fill(255, 215, 50, 210);
            _drawStar(sx, sy, sz * 0.40, sz, 4);
        }
    }

    function drawBlush() {
        let ey = CREATURE_SIZE * 0.13;
        let ex = CREATURE_SIZE * 0.28;
        p.noStroke();
        p.fill(255, 135, 160, 130);
        p.ellipse(-ex, ey, CREATURE_SIZE * 0.24, CREATURE_SIZE * 0.12);
        p.ellipse( ex, ey, CREATURE_SIZE * 0.24, CREATURE_SIZE * 0.12);
    }

    function _drawStar(x, y, r1, r2, npts) {
        let step = p.TWO_PI / npts;
        p.beginShape();
        for (let a = -p.HALF_PI; a < p.TWO_PI - p.HALF_PI; a += step) {
            p.vertex(x + Math.cos(a) * r2,            y + Math.sin(a) * r2);
            p.vertex(x + Math.cos(a + step/2) * r1,   y + Math.sin(a + step/2) * r1);
        }
        p.endShape(p.CLOSE);
    }


    // ============================================================
    //  RPG SYSTEM
    // ============================================================

    let RPG_NAME       = 'FAMILIAR';
    let rpgFeeds       = 0;
    let floatNums      = [];
    let rpgDialog      = null;
    let rpgDialogTimer = 0;

    let playerMana    = 0;
    let waterCooldown = 0;
    let fireCooldown  = 0;
    let spells        = [];

    const XP_PER_LEVEL = 20;

    const RPG_LINES = {
        happy:      ['HP restored!', 'Power surges within~', 'Feeling blessed...', 'Full strength!'],
        neutral:    ['HP fading...', 'I hunger...', 'Awaiting orders.', 'Need sustenance.'],
        distressed: ['CRITICAL HP!', 'Must endure...', 'I need healing!', '...barely standing.'],
        excited:    ['BATTLE STANCE!', 'Enemy spotted!', 'BERSERK MODE!', 'Adrenaline surge!'],
    };

    function rpgLevel() { return Math.floor(rpgFeeds / XP_PER_LEVEL) + 1; }
    function rpgXP()    { return rpgFeeds % XP_PER_LEVEL; }

    // ── Nameplate: Lv + Name + ♥ hearts ─────────────────────
    function drawNameplate(c) {
        const lv     = rpgLevel();
        const maxHp  = playerMaxHp();
        const curHp  = Math.max(0, Math.round((1 - c.need / 100) * maxHp));
        const maxMp  = playerMaxMana();
        const curMp  = Math.floor(playerMana);
        const nx     = c.x;
        const ny     = c.y - CREATURE_SIZE * c.sizeScale * 0.60 - 14;
        const barW   = 108;
        const barH   = 8;

        p.push();
        p.noStroke();

        // Lv (blue) + Name (gold)
        const lvTxt   = `Lv.${lv}`;
        const nameTxt = RPG_NAME;
        p.textSize(13);
        p.textAlign(p.LEFT, p.CENTER);
        const lvW    = p.textWidth(lvTxt);
        const gapW   = p.textWidth('  ');
        const nameW  = p.textWidth(nameTxt);
        const startX = nx - (lvW + gapW + nameW) / 2;
        const textY  = ny - barH * 2 - 10 - 8;
        p.fill(150, 200, 255);
        p.text(lvTxt, startX, textY);
        p.fill(255, 215, 65);
        p.text(nameTxt, startX + lvW + gapW, textY);

        const barX = nx - barW / 2;

        // HP bar
        const hpRat = Math.max(0, curHp / maxHp);
        let   barY  = ny - barH * 2 - 6;
        p.fill(30, 10, 10, 190);
        p.rect(barX, barY, barW, barH, 3);
        p.fill(200, 48, 68);
        p.rect(barX, barY, barW * hpRat, barH, 3);
        p.textSize(7);
        p.textAlign(p.CENTER, p.CENTER);
        p.fill(255, 220, 220);
        p.text(`${curHp}/${maxHp}`, nx, barY + barH / 2);

        // Mana bar
        const mpRat = Math.max(0, curMp / maxMp);
        barY = ny - barH - 2;
        p.fill(10, 10, 35, 190);
        p.rect(barX, barY, barW, barH, 3);
        p.fill(55, 120, 255);
        p.rect(barX, barY, barW * mpRat, barH, 3);
        p.textSize(7);
        p.textAlign(p.CENTER, p.CENTER);
        p.fill(180, 210, 255);
        p.text(`${curMp}/${maxMp}`, nx, barY + barH / 2);

        p.pop();
    }

    // ── Bottom HUD (WoW-style) ─────────────────────────────
    const HUD_H    = 88;
    const SLOT_S   = 50;
    const SLOT_GAP = 6;
    let   hudSlots = [];
    let   hudSlotPos = [];   // for click detection

    const DECO_KEYS = ['hat', 'crown', 'bowtie', 'sparkles', 'blush'];

    const DECO_DISPLAY = {
        hat:      { icon: '🎩', label: 'Hat' },
        crown:    { icon: '👑', label: 'Crown' },
        bowtie:   { icon: '🎀', label: 'Bow' },
        blush:    { icon: '🌸', label: 'Blush' },
        sparkles: { icon: '✨', label: 'Stars' },
    };

    function syncDecoUI() {
        DECO_KEYS.forEach(k => {
            const on      = DECORATIONS[k];
            const btn     = document.querySelector(`.deco-btn[data-deco="${k}"]`);
            const iconEl  = document.getElementById(`deco-icon-${k}`);
            const lblEl   = document.getElementById(`deco-lbl-${k}`);
            if (btn)    btn.classList.toggle('active', on);
            if (iconEl)  iconEl.textContent = on ? DECO_DISPLAY[k].icon  : '—';
            if (lblEl)   lblEl.textContent  = on ? DECO_DISPLAY[k].label : 'Empty';
        });
    }

    function randomCostume() {
        DECO_KEYS.forEach(k => { DECORATIONS[k] = false; });
        let shuffled = DECO_KEYS.slice().sort(() => p.random() - 0.5);
        let count = Math.floor(p.random(1, 4));
        shuffled.slice(0, count).forEach(k => { DECORATIONS[k] = true; });
        syncDecoUI();
        spawnFloat(creature.x, creature.y - 20, '✦ New Look! ✦', [255, 180, 220]);
    }

    function initHudSlots() {
        hudSlots = [
            { icon: '🍔', label: 'Feed',    imgKey: 'potion', isActive: () => false,
              action: feedCreature },
            { icon: '🎭', label: 'Dress',   isActive: () => DECO_KEYS.some(k => DECORATIONS[k]),
              action: randomCostume },
            { icon: '⚔️', label: 'Weapon',  imgKey: 'sword',  isActive: () => currentWeapons.length > 0,
              action: randomWeapon },
            { icon: '⚔', label: 'Battle',  isActive: () => BATTLE_MODE,
              action: toggleBattleMode },
        ];
    }

    function feedCreature() {
        creature.need = p.max(0, creature.need - CLICK_FEED);
        spawnFloat(creature.x, creature.y, `+${CLICK_FEED} HP`, [80, 215, 95]);
    }

    function drawBottomHUD(c) {
        let xpH   = 7;
        let hudY  = p.height - HUD_H;
        let slotAreaH = HUD_H - xpH;

        p.noStroke();

        // ── XP bar (bottom strip) ──
        let xpY   = p.height - xpH;
        let xpRat = rpgXP() / XP_PER_LEVEL;
        p.fill(18, 14, 32);
        p.rect(0, xpY, p.width, xpH);
        if (xpRat > 0) {
            p.fill(70, 52, 190);
            p.rect(0, xpY, p.width * xpRat, xpH);
            p.fill(110, 90, 255, 90);
            p.rect(0, xpY, p.width * xpRat, 3);
        }


        // ── Left panel: Lv + hearts ──
        let cy = hudY + slotAreaH / 2;

        p.textAlign(p.LEFT, p.CENTER);
        p.textSize(16);
        p.fill(220, 185, 55);
        p.text(`Lv.${rpgLevel()}`, 18, cy - 12);

        let maxH  = 5;
        let hp    = 100 - c.need;
        let fullH = Math.round((hp / 100) * maxH);
        p.textSize(17);
        for (let i = 0; i < maxH; i++) {
            p.fill(i < fullH ? [232, 48, 68] : [80, 55, 65]);
            p.text(i < fullH ? '♥' : '♡', 18 + i * 20, cy + 12);
        }

        // ── Slot row (centered) ──
        let totalW  = hudSlots.length * SLOT_S + (hudSlots.length - 1) * SLOT_GAP;
        let slotX0  = p.width / 2 - totalW / 2;
        let slotY   = hudY + (slotAreaH - SLOT_S) / 2;
        hudSlotPos  = [];

        for (let i = 0; i < hudSlots.length; i++) {
            let s    = hudSlots[i];
            let sx   = slotX0 + i * (SLOT_S + SLOT_GAP);
            let active = s.isActive();
            hudSlotPos.push({ x: sx, y: slotY, w: SLOT_S, h: SLOT_S, action: s.action });

            // slot border only (transparent bg)
            p.noFill();
            p.stroke(active ? [160, 120, 255, 200] : [120, 110, 140, 100]);
            p.strokeWeight(1.5);
            p.rect(sx, slotY, SLOT_S, SLOT_S, 6);

            // active shimmer
            if (active) {
                p.noStroke();
                p.fill(130, 90, 255, 35);
                p.rect(sx, slotY, SLOT_S, SLOT_S, 6);
            }

            // icon — image if available, else emoji fallback
            p.noStroke();
            let slotImg = s.imgKey && slotImgs[s.imgKey];
            if (slotImg) {
                let pad = 8;
                p.imageMode(p.CORNER);
                p.image(slotImg, sx + pad, slotY + pad, SLOT_S - pad*2, SLOT_S - pad*2 - 6);
            } else {
                p.fill(255);
                p.textSize(22);
                p.textAlign(p.CENTER, p.CENTER);
                p.text(s.icon, sx + SLOT_S/2, slotY + SLOT_S/2 - 5);
            }

            // label
    
            p.textSize(7);
            p.fill(active ? [195, 165, 255] : [120, 110, 140]);
            p.textAlign(p.CENTER, p.BOTTOM);
            p.text(s.label, sx + SLOT_S/2, slotY + SLOT_S - 3);

            // slot number
            p.textSize(7);
            p.fill(90, 80, 110);
            p.textAlign(p.LEFT, p.TOP);
            p.text(i + 1, sx + 4, slotY + 3);
        }

        // ── Right panel: character name ──

        p.textSize(11);
        p.fill(255, 208, 65);
        p.textAlign(p.RIGHT, p.CENTER);
        p.noStroke();
        p.text(RPG_NAME, p.width - 18, cy);
    }

    function spawnFloat(x, y, text, col) {
        floatNums.push({ x, y, text, col, life: 75, maxLife: 75 });
    }

    function updateDrawFloatNums() {
        p.push();

        p.textAlign(p.CENTER, p.CENTER);
        for (let i = floatNums.length - 1; i >= 0; i--) {
            let f = floatNums[i];
            f.life--;
            if (f.life <= 0) { floatNums.splice(i, 1); continue; }
            let t    = f.life / f.maxLife;
            let yOff = (1 - t) * 55;
            let alpha = t * 255;
            let sz   = 15 + (1 - t) * 5;
            p.textSize(sz);
            p.fill(0, 0, 0, alpha * 0.55);
            p.text(f.text, f.x + 1, f.y - yOff + 1);
            p.fill(...f.col, alpha);
            p.text(f.text, f.x, f.y - yOff);
        }
        p.pop();
    }

    function tryRpgDialog(c) {
        rpgDialogTimer = Math.max(0, rpgDialogTimer - 1);
        if (rpgDialog || rpgDialogTimer > 0) return;
        // Priority: low HP warning (more urgent in battle mode)
        if (c.need > 75 && p.random() < (BATTLE_MODE ? 0.006 : 0.003)) {
            const warnings = ['HP Critical! Feed me!', 'I need healing now!', 'Click to restore HP!'];
            rpgDialog = { text: warnings[Math.floor(p.random(warnings.length))],
                          life: 220, maxLife: 220 };
            rpgDialogTimer = 140;
            return;
        }
        if (p.random() < 0.0012) {
            let lines = RPG_LINES[c.state] || RPG_LINES.neutral;
            rpgDialog = { text: lines[Math.floor(p.random(lines.length))], life: 200, maxLife: 200 };
            rpgDialogTimer = p.floor(p.random(240, 500));
        }
    }

    function drawRpgDialog(c) {
        if (!rpgDialog) return;
        rpgDialog.life--;
        if (rpgDialog.life <= 0) { rpgDialog = null; return; }
        let t     = rpgDialog.life / rpgDialog.maxLife;
        let alpha = t > 0.88 ? p.map(t, 1, 0.88, 0, 255)
                  : t < 0.18 ? p.map(t, 0.18, 0, 255, 0) : 255;

        let fontSize = 13;
        // cache bubble width — only compute when text changes
        if (!rpgDialog.tw) {
    
            p.textSize(fontSize);
            rpgDialog.tw = p.textWidth(rpgDialog.text) + 32;
        }
        let tw = rpgDialog.tw;
        let bh  = 36;
        let bx  = c.x;
        let by  = c.y - CREATURE_SIZE * c.sizeScale * 0.60 - 90;
        let tailH = 12;

        p.push();
        p.rectMode(p.CENTER);

        // drop shadow
        p.noStroke();
        p.fill(0, 0, 0, alpha * 0.18);
        p.rect(bx + 3, by + 3, tw, bh, 10);

        // white bubble
        p.fill(255, 255, 255, alpha);
        p.rect(bx, by, tw, bh, 10);

        // thin border
        p.strokeWeight(1.5);
        p.stroke(200, 200, 200, alpha);
        p.noFill();
        p.rect(bx, by, tw, bh, 10);

        // tail
        p.noStroke();
        p.fill(255, 255, 255, alpha);
        p.triangle(bx - 9, by + bh/2,
                   bx + 9, by + bh/2,
                   bx,     by + bh/2 + tailH);
        // tail border sides
        p.stroke(200, 200, 200, alpha);
        p.strokeWeight(1.5);
        p.line(bx - 9, by + bh/2, bx,     by + bh/2 + tailH);
        p.line(bx + 9, by + bh/2, bx,     by + bh/2 + tailH);

        // text
        p.noStroke();
        p.fill(40, 40, 40, alpha);
        p.textSize(fontSize);
        p.textAlign(p.CENTER, p.CENTER);
        p.text(rpgDialog.text, bx, by);

        p.pop();
    }

    // ── EDIT THIS — redesign the creature's body ──────────────

    function drawBody(c) {
        if (humanImg) {
            p.imageMode(p.CENTER);
            p.image(humanImg, 0, 0, CREATURE_SIZE * 2.0, CREATURE_SIZE * 2.0);
        } else {
            p.noStroke();
            p.fill(...bodyColour, c.bodyAlpha);
            p.ellipse(0, 0, CREATURE_SIZE, CREATURE_SIZE);
        }
    }


    // ── EDIT THIS — or remove the call from drawCreature() ────

    function drawEyes(c) {
        let eyeSize    = CREATURE_SIZE * 0.38;
        let eyeSpacing = CREATURE_SIZE * 0.26;
        let eyeY       = -CREATURE_SIZE * 0.08;

        let pupilSize = c.state === 'excited' ? eyeSize * 0.62 : eyeSize * 0.35;

        let angle     = p.atan2(p.mouseY - c.y, p.mouseX - c.x);
        let mouseDist = p.dist(p.mouseX, p.mouseY, c.x, c.y);
        let move      = p.min(eyeSize * 0.18, mouseDist * 0.012);
        let px2       = p.cos(angle) * move;
        let py2       = p.sin(angle) * move;

        for (let side of [-1, 1]) {
            let ex = eyeSpacing * side;
            let ey = eyeY;
            p.noStroke();
            p.fill(255);
            p.ellipse(ex, ey, eyeSize * 0.88, eyeSize * 0.88);
            p.fill(20);
            p.ellipse(ex + px2, ey + py2, pupilSize, pupilSize);
        }
        p.noStroke();
    }


    // ============================================================
    //  INPUT: MOUSE CLICK
    // ============================================================

    function onCanvasClick() {
        onUserActivity();
        cancelAutoBattle();
        if (!micActive) startMic();

        // HUD slot click detection
        if (p.mouseY >= p.height - HUD_H) {
            for (let sp of hudSlotPos) {
                if (p.mouseX >= sp.x && p.mouseX <= sp.x + sp.w &&
                    p.mouseY >= sp.y && p.mouseY <= sp.y + sp.h) {
                    sp.action();
                    return;
                }
            }
            return;
        }

        // Creature click
        let d    = p.dist(p.mouseX, p.mouseY, creature.x, creature.y);
        let hitR = (CREATURE_SIZE / 2) * creature.sizeScale;
        if (d < hitR) feedCreature();
    }


    // ============================================================
    //  INPUT: MICROPHONE
    // ============================================================

    async function startMic() {
        try {
            let stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            let ctx    = new (window.AudioContext || window['webkitAudioContext'])();
            let source = ctx.createMediaStreamSource(stream);
            micAnalyser = ctx.createAnalyser();
            micAnalyser.fftSize = 256;
            source.connect(micAnalyser);
            micData   = new Uint8Array(micAnalyser.frequencyBinCount);
            micActive = true;
        } catch(e) {
            console.log('Mic unavailable:', e);
        }
    }

    function getMicLevel() {
        if (!micAnalyser) return 0;
        micAnalyser.getByteFrequencyData(micData);
        let sum = 0;
        for (let i = 0; i < micData.length; i++) sum += micData[i];
        return sum / (micData.length * 255);
    }

    function updateMic(c) {
        if (!micActive) return;
        c.micLevel = getMicLevel();
        if (c.micLevel > MIC_THRESHOLD) c.exciteTimer = EXCITED_FRAMES;
    }


    // ============================================================
    //  PERSISTENCE
    // ============================================================

    function saveState(c) {
        try {
            localStorage.setItem('creature_v2', JSON.stringify({
                need: c.need, lastVisit: Date.now(), totalVisits: c.totalVisits,
                rpgFeeds, rpgName: RPG_NAME,
            }));
        } catch(e) {}
    }

    function loadState(c) {
        try {
            let raw = localStorage.getItem('creature_v2');
            if (!raw) { c.totalVisits = 1; return; }
            let data = JSON.parse(raw);
            c.need        = data.need || 50;
            c.lastVisit   = data.lastVisit;
            c.totalVisits = (data.totalVisits || 0) + 1;
            rpgFeeds      = data.rpgFeeds  || 0;
            if (data.rpgName) RPG_NAME = data.rpgName;
            if (c.lastVisit) {
                let hours = Math.min((Date.now() - c.lastVisit) / 3600000, AFK_MAX_HOURS);
                c.need = Math.min(c.need + hours * AFK_PER_HOUR, 100);
            }
        } catch(e) {
            c.totalVisits = 1;
        }
    }


    // ============================================================
    //  SIDEBAR SYNC  —  updates the live state panel each frame
    // ============================================================

    function updateSidebar(c) {
        ui.state.textContent   = c.state;
        ui.needVal.textContent = Math.floor(c.need);

        // Hearts
        if (ui.hearts) {
            const full = Math.round(((100 - c.need) / 100) * 5);
            ui.hearts.textContent = '♥'.repeat(full) + '♡'.repeat(5 - full);
        }

        // RPG level / XP
        if (ui.lvEl)   ui.lvEl.textContent   = rpgLevel();
        if (ui.xpEl)   ui.xpEl.textContent   = `${rpgXP()}/${XP_PER_LEVEL}`;
        if (ui.xpFill) ui.xpFill.style.width = (rpgXP() / XP_PER_LEVEL * 100) + '%';

        ui.needBar.style.width = c.need + '%';
        ui.needBar.style.backgroundColor =
            c.need < 30 ? '#788c5d' :
            c.need < 70 ? '#c9973a' : '#c0522a';

        // Character stats panel — textContent only, no innerHTML in hot path
        const maxHp = playerMaxHp();
        const curHp = Math.max(0, Math.round((1 - c.need / 100) * maxHp));
        if (ui.hpEl)  ui.hpEl.textContent  = `${curHp}/${maxHp}`;
        if (ui.mpEl)  ui.mpEl.textContent  = `${Math.floor(playerMana)}/${playerMaxMana()}`;
        if (ui.atkEl) ui.atkEl.textContent = playerAtk();
        if (ui.spdEl) ui.spdEl.textContent = (playerSpdTotal() * 100).toFixed(1);
        if (ui.defEl) ui.defEl.textContent = `${playerDef().toFixed(1)}%`;

        // Skill icons: lock overlay + cooldown (scaleY, no reflow) + ready glow
        const skillLv = rpgLevel();
        if (ui.skillLockW) ui.skillLockW.style.display = skillLv >= 5  ? 'none' : 'flex';
        if (ui.skillLockF) ui.skillLockF.style.display = skillLv >= 10 ? 'none' : 'flex';
        if (ui.skillCdW)   ui.skillCdW.style.transform = `scaleY(${waterCooldown > 0 ? (waterCooldown / 55).toFixed(2) : 0})`;
        if (ui.skillCdF)   ui.skillCdF.style.transform = `scaleY(${fireCooldown  > 0 ? (fireCooldown  / 90).toFixed(2) : 0})`;
        if (ui.skillSlotW) ui.skillSlotW.classList.toggle('ready', skillLv >= 5  && waterCooldown === 0 && playerMana >= 15 && BATTLE_MODE);
        if (ui.skillSlotF) ui.skillSlotF.classList.toggle('ready', skillLv >= 10 && fireCooldown  === 0 && playerMana >= 25 && BATTLE_MODE);

        // Portrait eyes: pupils track mouse relative to portrait center
        const eyeL = document.getElementById('portrait-eye-l');
        const eyeR = document.getElementById('portrait-eye-r');
        if (eyeL && eyeR) {
            const rect = eyeL.closest('.char-portrait').getBoundingClientRect();
            const cx = rect.left + rect.width  / 2;
            const cy = rect.top  + rect.height / 2;
            const dx = p.mouseX - cx;
            const dy = p.mouseY - cy;
            const maxShift = 3;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const tx = (dx / dist) * Math.min(dist * 0.15, maxShift);
            const ty = (dy / dist) * Math.min(dist * 0.15, maxShift);
            const pupilSize = c.state === 'excited' ? '70%' : '50%';
            for (const eye of [eyeL, eyeR]) {
                const pupil = eye.querySelector('.portrait-pupil');
                if (pupil) {
                    pupil.style.transform = `translate(${tx}px, ${ty}px)`;
                    pupil.style.width = pupilSize;
                }
            }
        }
    }


    // ============================================================
    //  TIME API
    // ============================================================

    let _timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    function fetchTime() {
        fetch('https://worldtimeapi.org/api/ip')
            .then(r => r.json())
            .then(data => { _timezone = data.timezone; updateClock(); })
            .catch(() => {});
    }

    function updateClock() {
        const now   = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: _timezone,
            hour12: true,
            hour:   'numeric',
            minute: '2-digit',
        }).formatToParts(now);
        const hour   = parts.find(p => p.type === 'hour')?.value   || '--';
        const minute = parts.find(p => p.type === 'minute')?.value || '--';
        const period = (parts.find(p => p.type === 'dayperiod')?.value || '').toLowerCase();

        if (ui.hour)   ui.hour.textContent   = hour;
        if (ui.min)    ui.min.textContent    = minute;
        if (ui.period) ui.period.textContent = period;
        if (creature)  creature.hour = now.getHours();
    }

    // ============================================================
    //  WEATHER
    // ============================================================

    function wmoToInfo(code) {
        if (code === 0)              return { icon: '☀️',  desc: 'Clear' };
        if (code <= 3)               return { icon: '🌤️', desc: 'Cloudy' };
        if (code <= 48)              return { icon: '🌫️', desc: 'Foggy' };
        if (code <= 55)              return { icon: '🌦️', desc: 'Drizzle' };
        if (code <= 65)              return { icon: '🌧️', desc: 'Rain' };
        if (code <= 75)              return { icon: '❄️',  desc: 'Snow' };
        if (code <= 82)              return { icon: '🌧️', desc: 'Showers' };
        return                              { icon: '⛈️', desc: 'Storm' };
    }

    function fetchWeather() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude.toFixed(4);
            const lon = pos.coords.longitude.toFixed(4);

            const weatherUrl =
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,weather_code`;
            const geoUrl =
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;

            Promise.all([fetch(weatherUrl).then(r => r.json()),
                         fetch(geoUrl).then(r => r.json())])
                .then(([weather, geo]) => {
                    const temp = Math.round(weather.current.temperature_2m);
                    const code = weather.current.weather_code;
                    currentWeatherCode = code;
                    const info = wmoToInfo(code);
                    const city = geo.address?.city
                              || geo.address?.town
                              || geo.address?.village
                              || geo.address?.county
                              || '';

                    const el   = document.getElementById('rpg-weather');
                    const iEl  = document.getElementById('weather-icon');
                    const tEl  = document.getElementById('weather-temp');
                    const dEl  = document.getElementById('weather-desc');
                    const cEl  = document.getElementById('weather-city');
                    if (el)  el.style.display  = 'flex';
                    if (iEl) iEl.textContent   = info.icon;
                    if (tEl) tEl.textContent   = temp + '°C';
                    if (dEl) dEl.textContent   = info.desc;
                    if (cEl) cEl.textContent   = city;
                })
                .catch(() => {});
        }, () => {});
    }

    p.windowResized = function() {
        let sz = canvasSize();
        p.resizeCanvas(sz.w, sz.h);
        if (creature) {
            creature.originX = p.width / 2;
            creature.originY = p.height / 2;
        }
        rebuildBgLayer();
        if (paintLayer) initPaintLayer(sz.w, sz.h);
    };


    // ============================================================
    //  SIDEBAR CONTROLS  —  exposed to button onclick handlers
    // ============================================================

    window._setRpgName = name => {
        RPG_NAME = name.trim().toUpperCase() || 'FAMILIAR';
    };

    window._toggleDeco = key => {
        if (!(key in DECORATIONS)) return;
        DECORATIONS[key] = !DECORATIONS[key];
        syncDecoUI();
    };

    window._clearPaint     = () => { if (paintLayer) { paintLayer.clear(); paintPrevX = null; paintPrevY = null; paintLayerDirty = false; } };
    window._setPaintStyle  = s => {
        LINE_STYLE = s;
        document.querySelectorAll('.paint-style-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.style === s));
    };
    window._setPaintColor  = v => { LINE_COLOR = v; };
    window._setLineWidth   = v => { LINE_WIDTH = v; };
    window._resetNeed   = () => { if (creature) creature.need = 0; };
    window._resetLevel  = () => {
        rpgFeeds  = 0;
        playerMana = 0;
        spawnFloat(creature.x, creature.y - 30, '↺ Level Reset', [180, 140, 255]);
    };
    window._setDecay    = v => { DECAY_RATE = v; };
    window._setFeed     = v => { CLICK_FEED = v; };
    window._toggleTrail = () => {
        SHOW_TRAIL = !SHOW_TRAIL;
        if (!SHOW_TRAIL) trailPoints = [];
        const btn = document.getElementById('btn-trail');
        if (btn) {
            btn.classList.toggle('active', SHOW_TRAIL);
            btn.textContent = SHOW_TRAIL ? 'Trail: on' : 'Trail: off';
        }
    };

    window._setMoveMode = m => {
        MOVE_MODE = m;
        idleTimer = 0;
        arcAngle  = 0;
        gridPhase = 'h';
        if (m === 'off' && paintLayer) paintLayer.clear();
    };

    // ── RPG panel helpers ──────────────────────────────────
    window._feedCreature    = feedCreature;
    window._randomCostume   = randomCostume;
    window._randomWeapon    = randomWeapon;
    window._toggleBattle    = toggleBattleMode;

    const WEAPON_EMOJI = { sword:'⚔️', wand:'🪄', hammer:'🔨', shield:'🛡️', Orb:'🔮', dagger:'🗡️' };

    function updateWeaponSlots() {
        for (let i = 0; i < 2; i++) {
            let slotEl  = document.getElementById(`equip-wpn-${i}`);
            let iconEl  = document.getElementById(`ws-icon-${i}`);
            let labelEl = document.getElementById(`ws-label-${i}`);
            if (!iconEl || !labelEl) continue;
            if (currentWeapons[i] !== undefined) {
                let name = weaponNames[currentWeapons[i]];
                let path = WEAPON_PATHS[currentWeapons[i]];
                iconEl.innerHTML = `<img src="${path}" style="width:28px;height:28px;object-fit:contain">`;
                labelEl.textContent = name;
                if (slotEl) slotEl.classList.add('active');
            } else {
                iconEl.textContent = '—';
                labelEl.textContent = 'Empty';
                if (slotEl) slotEl.classList.remove('active');
            }
        }
        // Update weapon bonus spans — only runs on weapon change, not every frame
        for (const stat of ['mp', 'atk', 'spd', 'def']) {
            const el = ui[stat + 'Bonus'];
            if (!el) continue;
            let text = '', color = '';
            for (const idx of currentWeapons) {
                if (idx === undefined) continue;
                const b = WEAPON_STAT_BONUS[weaponNames[idx]];
                if (!b || b.stat !== stat) continue;
                text  += b.display + ' ';
                color  = `rgb(${b.col[0]},${b.col[1]},${b.col[2]})`;
            }
            el.textContent = text.trim();
            el.style.color = color;
        }
    }

    function updateBattleBtn() {
        const el  = document.getElementById('battle-btn');
        const lbl = document.getElementById('battle-lbl');
        if (el)  el.classList.toggle('active', BATTLE_MODE);
        if (lbl) lbl.textContent = BATTLE_MODE ? 'ON!' : 'Battle';
    }

}, document.body);
