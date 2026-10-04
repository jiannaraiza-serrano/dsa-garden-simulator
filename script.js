const APP_VERSION = "0.4.0";

let pyodideInstance = null;
let gardenPlants = {};          // pos → {name, emoji, stage}
let plantEmojiMap = {};
let actionStack = [];           // real undo stack: each item is {label, undo}
let inspectedPos = null;        // currently inspected plant
let traversalToken = 0;         // used to cancel a running traversal animation

// Growth stages
const STAGES = [
    { id: 0, name: "Seed",     emoji: "🌰" },
    { id: 1, name: "Seedling", emoji: "🌱" },
    { id: 2, name: "Sprout",   emoji: "🌿" },
    { id: 3, name: "Mature",   emoji: null }
];

// Fixed branching journey template (circular nodes)
const JOURNEY_NODES = [
    { id: "seed",       label: "Seed",              emoji: "🌰", x: 50, y: 12 },
    { id: "seedling",   label: "Seedling",          emoji: "🌱", x: 50, y: 38 },
    { id: "thriving",   label: "Thriving Sprout",   emoji: "🌿", x: 28, y: 62 },
    { id: "struggling", label: "Struggling Sprout", emoji: "🥀", x: 72, y: 62 },
    { id: "flowering",  label: "Flowering Bud",     emoji: "🌸", x: 18, y: 88 },
    { id: "stunted",    label: "Stunted Bud",       emoji: "🍂", x: 82, y: 88 }
];
const JOURNEY_EDGES = [
    ["seed", "seedling"],
    ["seedling", "thriving"],
    ["seedling", "struggling"],
    ["thriving", "flowering"],
    ["struggling", "stunted"]
];

// Label (name used in Python) → node id (used in the UI)
const LABEL_TO_ID = {};
JOURNEY_NODES.forEach(n => { LABEL_TO_ID[n.label] = n.id; });

// Backup answers in case Pyodide is not ready yet
const FALLBACK_ORDER = {
    pre:  ["Seed", "Seedling", "Thriving Sprout", "Flowering Bud", "Struggling Sprout", "Stunted Bud"],
    in:   ["Flowering Bud", "Thriving Sprout", "Seedling", "Stunted Bud", "Struggling Sprout", "Seed"],
    post: ["Flowering Bud", "Thriving Sprout", "Stunted Bud", "Struggling Sprout", "Seedling", "Seed"],
    bfs:  ["Seed", "Seedling", "Thriving Sprout", "Struggling Sprout", "Flowering Bud", "Stunted Bud"]
};

const TRAVERSAL_INFO = {
    pre:  { name: "PRE-ORDER",  dir: "Top ↓ Bottom (visit parent first, then children)" },
    in:   { name: "IN-ORDER",   dir: "First child → Node → remaining children" },
    post: { name: "POST-ORDER", dir: "Bottom ↑ Top (visit children first, parent last)" },
    bfs:  { name: "BFS",        dir: "Top ↓ Bottom, level by level (uses a queue)" }
};

function stageToNodeId(stage) {
    if (stage <= 0) return "seed";
    if (stage === 1) return "seedling";
    if (stage === 2) return "thriving";
    return "flowering";
}

// Python code that runs the traversals on the growth journey tree.
// Names are prefixed so they never clash with the student's own code.
const JOURNEY_PYTHON = `
from collections import deque

class JourneyNode:
    def __init__(self, name):
        self.name = name
        self.children = []

_j_seed = JourneyNode("Seed")
_j_seedling = JourneyNode("Seedling")
_j_thriving = JourneyNode("Thriving Sprout")
_j_struggling = JourneyNode("Struggling Sprout")
_j_flowering = JourneyNode("Flowering Bud")
_j_stunted = JourneyNode("Stunted Bud")

_j_seed.children.append(_j_seedling)
_j_seedling.children.append(_j_thriving)
_j_seedling.children.append(_j_struggling)
_j_thriving.children.append(_j_flowering)
_j_struggling.children.append(_j_stunted)

def _j_preorder(node, result):
    result.append(node.name)
    for child in node.children:
        _j_preorder(child, result)

def _j_inorder(node, result):
    # Generalized in-order for an n-ary tree:
    # recurse into the first child -> visit this node -> recurse into the rest
    if not node.children:
        result.append(node.name)
        return
    first_child, *rest_children = node.children
    _j_inorder(first_child, result)
    result.append(node.name)
    for child in rest_children:
        _j_inorder(child, result)

def _j_postorder(node, result):
    for child in node.children:
        _j_postorder(child, result)
    result.append(node.name)

def _j_bfs(root):
    result = []
    q = deque([root])
    while len(q) > 0:
        current = q.popleft()
        result.append(current.name)
        for child in current.children:
            q.append(child)
    return result

def run_traversal(kind):
    result = []
    if kind == "pre":
        _j_preorder(_j_seed, result)
    elif kind == "in":
        _j_inorder(_j_seed, result)
    elif kind == "post":
        _j_postorder(_j_seed, result)
    else:
        result = _j_bfs(_j_seed)
    return result
`;

//=========================================================================
// TOPIC TEMPLATES
//=========================================================================
const topicTemplates = {
    1: {
        title: "Python OOP + Big O + Stacks",
        code: `# Topic 1: Python OOP + Big O + Stacks
class Plant:
    def __init__(self, name, water_need):
        self.name = name
        self.water_need = water_need
        self.health = 100
        print("You successfully grown a plant!")

updateResources(water=100, seeds=90, energy=100, hope=80, coins=999)

addPlantsToDropdown([
    ("Sunflower", "🌻", 100),
    ("Tulip", "🌷", 125),
    ("Cherry Blossom", "🌸", 150),
    ("Hibiscus", "🌺", 180),
    ("Hyacinth", "🪻", 210)
])
print("Resource Storage and Plant dropdown unlocked!")

class ActionHistoryStack:
    def __init__(self):
        self.stack = []
    def push_action(self, action_string):
        self.stack.append(action_string)
        pushAction(action_string)
    def pop_action(self):
        if not self.is_empty():
            return self.stack.pop()
        return None
    def peek(self):
        if not self.is_empty():
            return self.stack[-1]
        return None
    def is_empty(self):
        return len(self.stack) == 0

stack = ActionHistoryStack()
stack.push_action("Dig up the soil")
stack.push_action("Planted Sunflower seeds")
stack.push_action("Watered the garden")
print("Top action (peek):", stack.peek())
print("Popped action:", stack.pop_action())
print("Action History Stack ready!")
`
    },
    2: {
        title: "Queues & Deques (FIFO Elements)",
        code: `# Topic 2: Queues & Deques
from collections import deque

class ClimateQueue:
    def __init__(self):
        self.queue = deque()

    def add_challenge(self, event_name):
        self.queue.append(event_name)

    def process_hazard(self):
        if len(self.queue) != 0:
            return self.queue.popleft()
        return None


q = ClimateQueue()
q.add_challenge("Drought")
q.add_challenge("Flooding")
q.add_challenge("Heat Wave")

updateClimateQueue(list(q.queue))

q.process_hazard()  

print("Climate Queue (FIFO) ready!")
`
    },
    3: {
        title: "Static/Dynamic Arrays, 2D Lists, & Memory Structures",
        code: `# Topic 3: Static/Dynamic Arrays, 2D Lists & Memory Structures
class StaticArray:
    def __init__(self, capacity):
        self.capacity = capacity
        self.data = [None] * capacity
    def set(self, index, value):
        if index < 0 or index >= self.capacity:
            print("Index out of range!")
            return False
        self.data[index] = value
        return True
    def get(self, index):
        if index < 0 or index >= self.capacity:
            return None
        return self.data[index]

class DynamicArray:
    def __init__(self):
        self.capacity = 2
        self.size = 0
        self.data = [None] * self.capacity
    def append(self, value):
        if self.size == self.capacity:
            self.resize()
        self.data[self.size] = value
        self.size += 1
    def resize(self):
        new_capacity = self.capacity * 2
        new_data = [None] * new_capacity
        for i in range(self.size):
            new_data[i] = self.data[i]
        self.data = new_data
        self.capacity = new_capacity
        print("Resized! New capacity:", self.capacity)
    def to_list(self):
        return self.data[:self.size]

class GardenGrid:
    def __init__(self):
        self.rows = 5
        self.cols = 5
        self.grid = [[None for _ in range(self.cols)] for _ in range(self.rows)]
    def plant(self, row, col, name):
        if row < 0 or row >= self.rows or col < 0 or col >= self.cols:
            print("Tile is outside the garden!")
            return False
        if self.grid[row][col] is not None:
            print("Tile already has a plant!")
            return False
        self.grid[row][col] = name
        pos = row * self.cols + col
        addPlantToGrid(pos, name)
        return True
    def print_grid(self):
        for row in self.grid:
            line = ""
            for cell in row:
                line += ("P " if cell else ". ")
            print(line)

print("=" * 50)
print("TOPIC 3 – Static / Dynamic Arrays + 2D Grid")
print("=" * 50)
static = StaticArray(3)
static.set(0, "Sunflower")
static.set(1, "Tulip")
static.set(5, "Hibiscus")
print("Static array:", static.data)
dyn = DynamicArray()
for p in ["Sunflower", "Tulip", "Cherry Blossom", "Hibiscus", "Hyacinth"]:
    dyn.append(p)
print("Dynamic array:", dyn.to_list())
print()
print("GardenGrid class is ready.")
print("The live sanctuary starts EMPTY.")
print("Plants appear only when you select a plant from the Seed Bag")
print("and then click an empty tile.")
print("Topic 3 ready!")
`
    },
    4: {
        title: "Hierarchical Trees & Traversals",
        code: `# Topic 4: Hierarchical Trees & Traversals
from collections import deque

class TreeNode:
    def __init__(self, name):
        self.name = name
        self.children = []
    def add_child(self, child):
        self.children.append(child)

def preorder(node, result):
    if node is None: return
    result.append(node.name)
    for child in node.children:
        preorder(child, result)

def inorder(node, result):
    # Generalized in-order for an n-ary tree (not just binary):
    # recurse into the first child -> visit this node -> recurse into the rest
    if node is None: return
    if not node.children:
        result.append(node.name)
        return
    first_child, *rest_children = node.children
    inorder(first_child, result)
    result.append(node.name)
    for child in rest_children:
        inorder(child, result)

def postorder(node, result):
    if node is None: return
    for child in node.children:
        postorder(child, result)
    result.append(node.name)

def level_order(root):
    result = []
    if root is None: return result
    q = deque([root])
    while len(q) > 0:
        current = q.popleft()
        result.append(current.name)
        for child in current.children:
            q.append(child)
    return result

def height(node):
    if node is None: return 0
    max_child = 0
    for child in node.children:
        max_child = max(max_child, height(child))
    return 1 + max_child

def count_nodes(node):
    total = 1
    for child in node.children:
        total += count_nodes(child)
    return total

# Growth journey tree
root = TreeNode("Seed")
seedling = TreeNode("Seedling")
thriving = TreeNode("Thriving Sprout")
struggling = TreeNode("Struggling Sprout")
flowering = TreeNode("Flowering Bud")
stunted = TreeNode("Stunted Bud")

root.add_child(seedling)
seedling.add_child(thriving)
seedling.add_child(struggling)
thriving.add_child(flowering)
struggling.add_child(stunted)

pre = []
preorder(root, pre)
ino = []
inorder(root, ino)
post = []
postorder(root, post)

print("Preorder   :", pre)
print("Inorder    :", ino)
print("Postorder  :", post)
print("Level-order:", level_order(root))
print("Height:", height(root), "| Total nodes:", count_nodes(root))
print()
print("This tree represents the growth journey of the inspected plant.")
print("The UI also shows which plant is currently being inspected.")
pushAction("Traversed the plant growth journey")
print("Hierarchical tree ready!")
`
    },
    5: { title: "Binary Search Trees (BST) & Node Mutation", code: `# Topic 5\n# ==== WRITE YOUR CODE HERE ====\n` },
    6: { title: "Hash Tables, Collisions, & Rehashing", code: `# Topic 6\n# ==== WRITE YOUR CODE HERE ====\n` },
    7: { title: "Graph Foundations, Adjacency Matrices/Lists, & DFS/BFS", code: `# Topic 7\n# ==== WRITE YOUR CODE HERE ====\n` },
    8: { title: "Sorting Algorithms (Bubble, Insertion, Selection, Quick, & Merge Sort)", code: `# Topic 8\n# ==== WRITE YOUR CODE HERE ====\n` },
    9: { title: "Searching Algorithms (Linear Search vs. Binary Search)", code: `# Topic 9\n# ==== WRITE YOUR CODE HERE ====\n` },
    10: { title: "Advanced Strategic Paradigms (Dijkstra's Algorithm & Greedy Patterns)", code: `# Topic 10\n# ==== WRITE YOUR CODE HERE ====\n` },
    11: { title: "Dynamic Programming (DP), Memoization, & Divide-and-Conquer", code: `# Topic 11\n# ==== WRITE YOUR CODE HERE ====\n` }
};

// ---------- Pyodide ----------
async function initPyodide() {
    const consoleEl = document.getElementById("output-console");
    if (pyodideInstance) return;
    if (consoleEl) consoleEl.innerHTML = `<span class="text-amber-400">Loading Python...</span><br>`;
    try {
        pyodideInstance = await loadPyodide();
        pyodideInstance.globals.set("addPlantToGrid", addPlantToGrid);
        pyodideInstance.globals.set("updateResources", updateResources);
        pyodideInstance.globals.set("addPlantsToDropdown", addPlantsToDropdown);
        pyodideInstance.globals.set("pushAction", pushAction);
        pyodideInstance.globals.set("updateClimateQueue", updateClimateQueue);
        await pyodideInstance.runPythonAsync(`
import sys
from js import document
class Console:
    def write(self, text):
        if text and text.strip():
            el = document.getElementById("output-console")
            if el: el.innerHTML += text.replace("\\n", "<br>")
    def flush(self): pass
sys.stdout = Console()
        `);
        // Load the growth-journey tree + traversal functions (Python side)
        await pyodideInstance.runPythonAsync(JOURNEY_PYTHON);
        if (consoleEl) consoleEl.innerHTML = `<span class="text-emerald-400">Python ready.</span><br>`;
    } catch (err) {
        if (consoleEl) consoleEl.innerHTML = `<span class="text-red-400">Failed: ${err.message}</span>`;
        throw err;
    }
}

// ---------- Bridges ----------
function updateClimateQueue(events) {
    const c = document.getElementById("climate-queue");
    c.innerHTML = "";
    if (!events || !events.length) return;
    events.forEach(e => {
        const d = document.createElement("div");
        d.className = "p-3 bg-amber-950/40 border border-amber-900 rounded-xl text-xs";
        d.innerHTML = `<div class="font-bold text-amber-400">${e}</div>`;
        c.appendChild(d);
    });
}

function refreshAll() {
    renderGarden();
    updateOverview();
    renderJourneyTree();
}

// Plants a seed AND records how to undo it (remove the plant again)
function addPlantToGrid(pos, name) {
    const base = plantEmojiMap[name] || "🌱";
    const previousInspected = inspectedPos;
    gardenPlants[pos] = { name, emoji: base, stage: 0 };   // always starts as Seed
    inspectedPos = pos;
    refreshAll();

    recordAction(`Planted ${name} seed at tile ${pos}`, () => {
        delete gardenPlants[pos];
        inspectedPos = (previousInspected !== null && gardenPlants[previousInspected]) ? previousInspected : null;
        refreshAll();
    });
}

function addPlantsToDropdown(plants) {
    const sel = document.getElementById("crop-selector");
    sel.innerHTML = "";
    plantEmojiMap = {};
    if (!plants) return;
    plants.forEach(([name, emoji, cost]) => {
        plantEmojiMap[name] = emoji;
        const o = document.createElement("option");
        o.value = name;
        o.textContent = `${emoji} ${name} (${cost}c)`;
        sel.appendChild(o);
    });
    sel.selectedIndex = -1; // blank until user chooses
}

function updateResources(water, seeds, energy, hope, coins) {
    if (typeof water === "object" && water !== null) {
        const a = water;
        water = a.water ?? 0; seeds = a.seeds ?? 0; energy = a.energy ?? 0;
        hope = a.hope ?? 0; coins = a.coins ?? 0;
    } else {
        water = water ?? 0; seeds = seeds ?? 0; energy = energy ?? 0;
        hope = hope ?? 0; coins = coins ?? 0;
    }
    document.getElementById("water-text").innerText = `${water} / 200 L`;
    document.getElementById("water-bar").style.width = `${Math.min(100, water / 2)}%`;
    document.getElementById("seeds-text").innerText = `${seeds} / 100`;
    document.getElementById("seeds-bar").style.width = `${Math.min(100, seeds)}%`;
    document.getElementById("energy-text").innerText = `${energy} / 120 Wh`;
    document.getElementById("energy-bar").style.width = `${Math.min(100, energy / 1.2)}%`;
    document.getElementById("hope-text").innerText = `${hope} / 100`;
    document.getElementById("hope-bar").style.width = `${Math.min(100, hope)}%`;
    document.getElementById("coins-text").innerText = `${coins} Coins`;
}

// ---------- Action History Stack (real undo) ----------
// push: label + (optional) function that reverses the action
function recordAction(label, undoFn) {
    actionStack.push({ label, undo: undoFn || null });
    renderActionStack();
}

// Called from Python (Topic 1 / Topic 4). These are only labels,
// so they have nothing on the screen to reverse.
function pushAction(action) {
    recordAction(action, null);
}

function renderActionStack() {
    const c = document.getElementById("action-stack");
    c.innerHTML = "";
    // show the newest 8, top of the stack first
    const visible = actionStack.slice(-8).reverse();
    visible.forEach((item, i) => {
        const d = document.createElement("div");
        d.className = "bg-emerald-950/60 border-l-2 border-amber-500 px-3 py-2 rounded text-xs text-emerald-100";
        d.textContent = (i === 0 ? "TOP → " : "→ ") + item.label;
        c.appendChild(d);
    });
}

// pop: remove the top action AND actually reverse it
function triggerUndo() {
    if (actionStack.length === 0) {
        showToast("Stack is empty.");
        return;
    }
    const last = actionStack.pop();
    if (last.undo) {
        last.undo();
        showToast(`Undid: ${last.label}`);
    } else {
        showToast(`Removed from history: ${last.label}`);
    }
    renderActionStack();
}

function showToast(msg) {
    const t = document.createElement("div");
    t.className = "fixed bottom-6 right-6 bg-emerald-900 border border-emerald-400 text-white px-5 py-3 rounded-2xl shadow-2xl z-50 text-sm";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

// ---------- Grid interaction ----------
function handleCellClick(pos) {
    if (gardenPlants[pos]) {
        // Already planted → inspect or harvest
        if (inspectedPos === pos) {
            // second click = harvest
            const removed = { ...gardenPlants[pos] };
            delete gardenPlants[pos];
            inspectedPos = null;
            refreshAll();
            showToast(`Harvested ${removed.name}!`);

            // undo = put the exact same plant (same stage) back
            recordAction(`Harvested ${removed.name} from tile ${pos}`, () => {
                gardenPlants[pos] = removed;
                inspectedPos = pos;
                refreshAll();
            });
        } else {
            // first click on planted tile = inspect
            inspectedPos = pos;
            renderGarden();
            renderJourneyTree();
            showToast(`Inspecting ${gardenPlants[pos].name}`);
        }
    } else {
        // Empty tile → plant only if user selected something
        const name = document.getElementById("crop-selector").value;
        if (!name) {
            showToast("Select a plant from the Seed Bag first.");
            return;
        }
        addPlantToGrid(pos, name);      // this also records the undo
        showToast(`Planted ${name} seed!`);
    }
}

function getDisplayEmoji(p) {
    if (p.stage >= 3) return p.emoji;
    return STAGES[p.stage].emoji;
}

function renderGarden() {
    const grid = document.getElementById("garden-grid");
    grid.innerHTML = "";
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement("div");
        cell.className = "garden-cell aspect-square";
        if (gardenPlants[i]) {
            cell.classList.add("planted");
            if (inspectedPos === i) cell.classList.add("selected");
            cell.textContent = getDisplayEmoji(gardenPlants[i]);
            cell.title = `${gardenPlants[i].name} – ${STAGES[gardenPlants[i].stage].name}`;
            const badge = document.createElement("span");
            badge.className = "stage-badge";
            badge.textContent = STAGES[gardenPlants[i].stage].name[0];
            cell.appendChild(badge);
        } else {
            cell.textContent = "□";
        }
        cell.onclick = () => handleCellClick(i);
        grid.appendChild(cell);
    }
}

// ---------- Growth ----------
function advanceAllGrowth() {
    const grewAt = [];
    Object.keys(gardenPlants).forEach(pos => {
        if (gardenPlants[pos].stage < 3) {
            gardenPlants[pos].stage++;
            grewAt.push(pos);
        }
    });
    if (grewAt.length) {
        showToast(`${grewAt.length} plant(s) grew!`);
        refreshAll();

        // undo = move only those plants back one stage
        recordAction(`Advanced growth of ${grewAt.length} plant(s)`, () => {
            grewAt.forEach(pos => {
                if (gardenPlants[pos] && gardenPlants[pos].stage > 0) {
                    gardenPlants[pos].stage--;
                }
            });
            refreshAll();
        });
    } else showToast("All plants are already mature.");
}

function updateOverview() {
    let total = 0, seed = 0, growing = 0, mature = 0;
    Object.values(gardenPlants).forEach(p => {
        total++;
        if (p.stage === 0) seed++;
        else if (p.stage >= 3) mature++;
        else growing++;
    });
    document.getElementById("ov-total").textContent = total;
    document.getElementById("ov-seed").textContent = seed;
    document.getElementById("ov-growing").textContent = growing;
    document.getElementById("ov-mature").textContent = mature;
}

// ---------- Growth Journey Tree ----------
function renderJourneyTree() {
    traversalToken++;   // any running traversal animation stops when the tree is redrawn

    const canvas = document.getElementById("tree-canvas");
    const labelEl = document.getElementById("inspecting-label");
    const outEl = document.getElementById("traversal-output");
    canvas.innerHTML = "";

    if (inspectedPos === null || !gardenPlants[inspectedPos]) {
        labelEl.textContent = "No plant selected – click a planted tile to inspect its growth journey.";
        outEl.textContent = "Select a planted tile to view its growth journey.";
        canvas.innerHTML = `<div class="text-emerald-600/50 text-xs w-full text-center pt-16">Select a planted tile to view its growth journey.</div>`;
        return;
    }

    const plant = gardenPlants[inspectedPos];
    // Clearly show which plant is being inspected (NOT as the tree root)
    labelEl.innerHTML = `Inspecting: <span class="text-amber-300 font-semibold">${plant.emoji} ${plant.name}</span> @ tile ${inspectedPos}`;

    const currentId = stageToNodeId(plant.stage);

    // Draw connecting lines
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("tree-lines");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");

    JOURNEY_EDGES.forEach(([from, to]) => {
        const a = JOURNEY_NODES.find(n => n.id === from);
        const b = JOURNEY_NODES.find(n => n.id === to);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", a.x);
        line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x);
        line.setAttribute("y2", b.y);
        line.setAttribute("stroke", "#4ade80");
        line.setAttribute("stroke-width", "0.6");
        line.setAttribute("stroke-dasharray", "1.5 1");
        line.setAttribute("opacity", "0.7");
        svg.appendChild(line);
    });
    canvas.appendChild(svg);

    // Draw circular nodes
    JOURNEY_NODES.forEach(n => {
        const div = document.createElement("div");
        div.id = "node-" + n.id;
        div.className = "node" + (n.id === currentId ? " current" : " dim");
        div.style.left = `calc(${n.x}% - 26px)`;
        div.style.top  = `calc(${n.y}% - 26px)`;
        let emoji = n.emoji;
        if (n.id === "flowering" && plant.stage >= 3) emoji = plant.emoji;
        div.innerHTML = `${emoji}<div class="node-label">${n.label}</div>`;
        canvas.appendChild(div);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Runs the traversal in Python, then animates the visit order on the tree.
// Post-order visibly climbs from the bottom leaves up to the root;
// Pre-order and BFS go from the root downward.
async function runTraversal(type) {
    const out = document.getElementById("traversal-output");

    if (inspectedPos === null || !gardenPlants[inspectedPos]) {
        showToast("Select a planted tile first.");
        return;
    }

    renderJourneyTree();                 // fresh tree, cancels older animation
    const myToken = ++traversalToken;    // this run's ID

    // 1) get the visit order from Python
    let order;
    try {
        await initPyodide();
        const fn = pyodideInstance.globals.get("run_traversal");
        const proxy = fn(type);
        order = proxy.toJs();
        proxy.destroy();
        fn.destroy();
    } catch (err) {
        order = FALLBACK_ORDER[type];
    }

    const info = TRAVERSAL_INFO[type];
    const visited = [];

    // 2) animate one node at a time
    for (let i = 0; i < order.length; i++) {
        if (myToken !== traversalToken) return;   // cancelled

        document.querySelectorAll(".node.visiting").forEach(el => el.classList.remove("visiting"));

        const el = document.getElementById("node-" + LABEL_TO_ID[order[i]]);
        if (el) {
            el.classList.add("visited", "visiting");
            const badge = document.createElement("span");
            badge.className = "step-badge";
            badge.textContent = i + 1;
            el.appendChild(badge);
        }

        visited.push(order[i]);
        out.textContent = `${info.name} — ${info.dir}\n` + visited.join(" → ");
        out.style.whiteSpace = "pre-wrap";

        await sleep(800);
    }

    if (myToken === traversalToken) {
        document.querySelectorAll(".node.visiting").forEach(el => el.classList.remove("visiting"));
    }
}

// ---------- Misc ----------
async function runPythonCode() {
    const el = document.getElementById("output-console");
    el.innerHTML = `<span class="text-amber-400">Running...</span><br>`;
    try {
        await initPyodide();
        await pyodideInstance.runPythonAsync(document.getElementById("code-editor").value.trim());
    } catch (err) {
        el.innerHTML += `<span class="text-red-400">Error: ${err.message}</span>`;
    }
}

function loadTopic() {
    const key = document.getElementById("topic-selector").value;
    document.getElementById("code-editor").value = topicTemplates[key].code;
}

function switchTab(tab) {
    document.getElementById("view-game").classList.toggle("hidden", tab !== "game");
    document.getElementById("view-code").classList.toggle("hidden", tab !== "code");
    document.getElementById("tab-game").classList.toggle("bg-[#283623]", tab === "game");
    document.getElementById("tab-game").classList.toggle("text-emerald-100", tab === "game");
    document.getElementById("tab-code").classList.toggle("bg-[#283623]", tab === "code");
    document.getElementById("tab-code").classList.toggle("text-emerald-100", tab === "code");
}

window.onload = () => {
    document.getElementById("version-badge").textContent = "v" + APP_VERSION;
    lucide.createIcons();
    renderGarden();          // starts completely empty
    renderActionStack();
    updateOverview();
    renderJourneyTree();
    updateResources(0, 0, 0, 0, 0);

    const sel = document.getElementById("topic-selector");
    Object.keys(topicTemplates).forEach(k => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = topicTemplates[k].title;
        sel.appendChild(o);
    });
    loadTopic();
    switchTab("game");
    initPyodide().catch(() => {});

    // Fill Seed Bag but leave selection blank
    addPlantsToDropdown([
        ["Sunflower", "🌻", 100],
        ["Tulip", "🌷", 125],
        ["Cherry Blossom", "🌸", 150],
        ["Hibiscus", "🌺", 180],
        ["Hyacinth", "🪻", 210]
    ]);
};