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

    // Colours — also editable via sidebar colour pickers
    let bgColour   = [220, 242, 210];  // background (r, g, b)
    let bodyColour = [20,  20,  20];   // body fill  (r, g, b)


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

    const STATE_DESCRIPTIONS = {
        happy:      'need is low — bouncy, fully visible',
        neutral:    'need is rising — slightly transparent',
        distressed: 'need is high — shaking, 50% transparent',
        excited:    'heard a sound! — big pupils, roaming',
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

    let miniMode   = false;
    let paintLayer = null;
    let paintPrevX = null;
    let paintPrevY = null;

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

    let slotImgs = {};   // keyed image icons for HUD slots

    p.preload = function() {
        WEAPON_PATHS.forEach((path, i) => {
            weaponNames[i] = path.split('/').pop().replace(/\.[^.]+$/, '');
            p.loadImage(path,
                img => { weaponImgs[i] = img; },
                ()  => { weaponImgs[i] = null; }
            );
        });
        p.loadImage('image/HP_Potion.png', img => { slotImgs.potion = img; }, () => {});
        p.loadImage('image/sword.png',     img => { slotImgs.sword  = img; }, () => {});
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
        let wx    = c.x + side * (CREATURE_SIZE * c.sizeScale * 0.52 + wSize * 0.38);
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

    p.setup = function() {
        let sz  = canvasSize();
        let cnv = p.createCanvas(sz.w, sz.h);
        cnv.parent('canvas-container');
        cnv.mousePressed(onCanvasClick);

        creature = createCreature(p.width / 2, p.height / 2);
        loadState(creature);

        if (!SHOW_UI) document.querySelector('.sidebar').style.display = 'none';

        // Cache sidebar DOM refs once — no per-frame getElementById calls
        ui.hour    = document.getElementById('ui-hour');
        ui.period  = document.getElementById('ui-period');
        ui.state   = document.getElementById('ui-state');
        ui.desc    = document.getElementById('ui-desc');
        ui.needVal = document.getElementById('ui-need-val');
        ui.needBar = document.getElementById('ui-need-bar');
        ui.visits  = document.getElementById('ui-visits');
        ui.excited = document.getElementById('ui-excited');
        ui.watched = document.getElementById('ui-watched');
        ui.mic     = document.getElementById('ui-mic');

        // Track focus via events — no polling in the draw loop
        window.addEventListener('focus', () => { creature.isWatched = true; });
        window.addEventListener('blur',  () => { creature.isWatched = false; });

        initPaintLayer(sz.w, sz.h);
        initHudSlots();

        setInterval(() => { saveState(creature); creature.hour = new Date().getHours(); }, 30000);
        window.addEventListener('beforeunload', () => saveState(creature));
    };


    // ============================================================
    //  DRAW LOOP
    // ============================================================

    p.draw = function() {
        p.background(...bgColour);

        updateMic(creature);
        updateCreature(creature);
        if (paintLayer) p.image(paintLayer, 0, 0);
        if (SHOW_TRAIL) { recordTrail(creature); drawTrail(); }
        if (miniMode) drawPaintMark(creature);
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

        // Size: full when excited, mini when movement mode is active
        c.sizeTarget = (MOVE_MODE !== 'off' && c.exciteTimer === 0) ? 0.15 : 1.0;
        miniMode     = (MOVE_MODE !== 'off' && c.exciteTimer === 0);
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
            updateIdleMovement(c);
        }

        // lower lerp = softer easing into new direction (smoother turns)
        let lerpSpeed = MOVE_MODE === 'random' ? 0.018
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
        let lv      = rpgLevel();
        let hp      = Math.round(100 - c.need);
        let maxH    = 5;
        let fullH   = Math.round((hp / 100) * maxH);
        let nx      = c.x;
        let ny      = c.y - CREATURE_SIZE * c.sizeScale * 0.60 - 14;
        let lvTxt   = `Lv.${lv}`;
        let nameTxt = RPG_NAME;

        p.push();
        p.noStroke();
        p.textFont('Courier New');

        // Lv (blue) + Name (gold) — larger, centered
        p.textSize(18);
        p.textAlign(p.CENTER, p.CENTER);
        let fullLine = `${lvTxt}  ${nameTxt}`;
        let lvW = p.textWidth(lvTxt);
        let fullW = p.textWidth(fullLine);
        let startX = nx - fullW / 2;
        p.fill(150, 200, 255);
        p.text(lvTxt, startX + lvW / 2, ny - 18);
        p.fill(255, 215, 65);
        p.text(nameTxt, startX + lvW + p.textWidth('  ') + p.textWidth(nameTxt) / 2, ny - 18);

        // Hearts row — larger
        let heartSize = 22;
        let heartGap  = 4;
        let heartSpan = maxH * heartSize + (maxH - 1) * heartGap;
        let hx = nx - heartSpan / 2 + heartSize / 2;
        p.textSize(heartSize);
        p.textAlign(p.CENTER, p.CENTER);
        for (let i = 0; i < maxH; i++) {
            p.fill(i < fullH ? [230, 48, 68] : [80, 55, 65]);
            p.text(i < fullH ? '♥' : '♡', hx + i * (heartSize + heartGap), ny + 8);
        }

        p.pop();
    }

    // ── Bottom HUD (WoW-style) ─────────────────────────────
    const HUD_H    = 88;
    const SLOT_S   = 50;
    const SLOT_GAP = 6;
    let   hudSlots = [];
    let   hudSlotPos = [];   // for click detection

    const DECO_KEYS = ['hat', 'crown', 'bowtie', 'sparkles', 'blush'];

    function randomCostume() {
        // clear all decorations first
        DECO_KEYS.forEach(k => { DECORATIONS[k] = false; });
        // randomly pick 1–3 to enable
        let shuffled = DECO_KEYS.slice().sort(() => p.random() - 0.5);
        let count = Math.floor(p.random(1, 4));
        shuffled.slice(0, count).forEach(k => { DECORATIONS[k] = true; });
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
            { icon: '🧹', label: 'Clear',   isActive: () => false,
              action: () => window._clearPaint && window._clearPaint() },
            { icon: '🎲', label: 'Random',  isActive: () => MOVE_MODE === 'random',
              action: () => window._setMoveMode(MOVE_MODE === 'random' ? 'off' : 'random') },
            { icon: '📐', label: 'Grid',    isActive: () => MOVE_MODE === 'grid',
              action: () => window._setMoveMode(MOVE_MODE === 'grid' ? 'off' : 'grid') },
            { icon: '🌀', label: 'Arc',     isActive: () => MOVE_MODE === 'arc',
              action: () => window._setMoveMode(MOVE_MODE === 'arc' ? 'off' : 'arc') },
        ];
    }

    function feedCreature() {
        creature.need = p.max(0, creature.need - CLICK_FEED);
        rpgFeeds++;
        let prevLv = rpgLevel() - 1;
        spawnFloat(creature.x, creature.y, `+${CLICK_FEED} HP`, [80, 215, 95]);
        if (rpgLevel() > prevLv)
            spawnFloat(creature.x, creature.y - 32, '✦ LEVEL UP! ✦', [255, 210, 60]);
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
        p.textFont('Courier New');

        // ── Left panel: Lv + hearts ──
        let cy = hudY + slotAreaH / 2;
        p.textFont('Courier New');
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
            p.textFont('Courier New');
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
        p.textFont('Courier New');
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
        p.textFont('Courier New');
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
        p.textFont('Courier New');
        p.textSize(fontSize);
        let tw  = p.textWidth(rpgDialog.text) + 32;
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
        p.noStroke();
        p.fill(...bodyColour, c.bodyAlpha);
        p.ellipse(0, 0, CREATURE_SIZE, CREATURE_SIZE);
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
        ui.hour.textContent    = c.hour % 12 || 12;
        ui.period.textContent  = c.hour < 12 ? 'am' : 'pm';
        ui.state.textContent   = c.state;
        ui.desc.textContent    = STATE_DESCRIPTIONS[c.state] || '';
        ui.needVal.textContent = Math.floor(c.need);
        ui.visits.textContent  = c.totalVisits;
        ui.excited.textContent = c.exciteTimer > 0 ? 'yes!' : 'no';
        ui.watched.textContent = c.isWatched ? 'on' : 'away';
        ui.mic.textContent     = micActive ? c.micLevel.toFixed(2) : '—';

        // RPG stats
        const lvEl    = document.getElementById('ui-rpg-lv');
        const xpEl    = document.getElementById('ui-rpg-xp');
        const feedsEl = document.getElementById('ui-rpg-feeds');
        if (lvEl)    lvEl.textContent    = rpgLevel();
        if (xpEl)    xpEl.textContent    = `${rpgXP()}/${XP_PER_LEVEL}`;
        if (feedsEl) feedsEl.textContent = rpgFeeds;

        ui.needBar.style.width = c.need + '%';
        ui.needBar.style.backgroundColor =
            c.need < 30 ? '#788c5d' :
            c.need < 70 ? '#c9973a' : '#c0522a';
    }


    // ============================================================
    //  WINDOW RESIZE
    // ============================================================

    p.windowResized = function() {
        let sz = canvasSize();
        p.resizeCanvas(sz.w, sz.h);
        creature.originX = p.width / 2;
        creature.originY = p.height / 2;
        initPaintLayer(sz.w, sz.h);
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
        const btn = document.querySelector(`.deco-btn[data-deco="${key}"]`);
        if (btn) btn.classList.toggle('active', DECORATIONS[key]);
    };

    window._clearPaint     = () => { if (paintLayer) { paintLayer.clear(); paintPrevX = null; paintPrevY = null; } };
    window._setPaintStyle  = s => {
        LINE_STYLE = s;
        document.querySelectorAll('.paint-style-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.style === s));
    };
    window._setPaintColor  = v => { LINE_COLOR = v; };
    window._setLineWidth   = v => { LINE_WIDTH = v; };
    window._resetNeed   = () => { if (creature) creature.need = 0; };
    window._maxNeed     = () => { if (creature) creature.need = 100; };
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
        // highlight active button
        document.querySelectorAll('.move-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === m);
        });
    };

}, document.body);
