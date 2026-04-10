var onLevelRestarted = new Event("levelRestarted");

var RandomGen = new RNG();

function getIntroScreen(text) {
	return {
		lines: [
			"", 
			"==================", 
			"", 
			"Puzzle Script Next",
			"Version 3.0b",
			"", 
			"==================", 
			"", 
			text
		], 
		options: []
	};
}

function getMessageScreen(text) {
	return {
		lines: [
			"", "", "", "", "", "", "", "", "", "", 
			text
		], 
		options: [ 10 ]
	};
}

function getStartScreen(texts) {
	const lines = [
		"", "", "", "", "", "",
		...texts,
	];
	return {
		lines: lines, 
		options: fillRange(6, lines.length),
	};
}

function getPauseScreen(state) {
	const lines = [
		"",
		"-< GAME PAUSED >-",
		state.levels[curLevelNo].title || "",
		"",
		"resume game",
		!state.metadata.norestart ? "replay level from the start" : null,
		state.metadata.level_select ? "go to level select screen" : null,
		"exit to title screen",
	].filter(l => l != null);

	return {
		lines: lines,
		options: fillRange(4, lines.length),
	};
}

function getLevelSelectScreen(inserts) {
	const lines = [
		"[ ESC: Back ]                ",
		"Level Select",
		""
	];
	const options = [ ];
	inserts.forEach(ins => {
		options.push(lines.length);
		lines.push(ins);
	});
	return { lines: lines, options: options };
}

const MENUITEM_CONTINUE = 'Continue';
const MENUITEM_LEVELSELECT = 'Level Select';
const MENUITEM_NEWGAME = 'New Game';
const MENUITEM_STARTGAME = 'Start Game';

const TITLE_WIDTH = 34;
const TITLE_HEIGHT = 13;

var titleImage=[];
var textMode=true;
var titleScreen=true;
var titleMode=0;//1 means title screen with options, 2 means level select, 3 means pause screen
var titleSelection=0;
var titleSelected=false;
var hoverSelection=-1; //When mouse controls are enabled, over which row the mouse is hovering. -1 when disabled.
let lineColorOverride = [];		// a sparse array of line numbers and colours to use
let linkStack = [];				// where a link goto came from

// restore saved level, checkpoint, solved sections on startup
function doSetupTitleScreenLevelContinue(){
    try {
        if (storage_has(document.URL)) {
            if (storage_has(document.URL+'_checkpoint')) {
                var backupStr = storage_get(document.URL+'_checkpoint');
                curlevelTarget = JSON.parse(backupStr);
				if (debugSwitch.includes('menu')) console.log(`doSetupTitleScreenLevelContinue `, 'curlevelTarget=', curlevelTarget);
                
                var arr = [];
                for(var p in Object.keys(curlevelTarget.dat)) {
                    arr[p] = curlevelTarget.dat[p];
                }
                curlevelTarget.dat = new Int32Array(arr);
            }
            curLevelNo = +storage_get(document.URL); 
			if (storage_has(document.URL+"_sections")) {
				solvedSections = JSON.parse(storage_get(document.URL + "_sections"));
			}
		}
    } catch(ex) {
    }
}

doSetupTitleScreenLevelContinue();

function showContinueOptionOnTitleScreen(){
	return hasStartedTheGame() && !hasFinishedTheGame();
}

function hasStartedTheGame() {
	return (curLevelNo>0 || curlevelTarget !== null || storage_has(document.URL+'_checkpoint')) && (curLevelNo in state.levels);
}

function isMapLevelEntry(leveldat) {
	return !!(leveldat
		&& typeof leveldat === "object"
		&& !("message" in leveldat)
		&& !("target" in leveldat)
		&& typeof leveldat.width === "number"
		&& typeof leveldat.height === "number");
}

function isHiddenLabeledLevel(leveldat) {
	return !!(state && state.metadata && state.metadata.hide_labeled_levels
		&& isMapLevelEntry(leveldat)
		&& leveldat.isLabeledLevel === true);
}

function getNextAutoLevelIndex(fromIndex) {
	if (!state || !Array.isArray(state.levels)) {
		return -1;
	}
	for (let i = fromIndex + 1; i < state.levels.length; i++) {
		if (!isHiddenLabeledLevel(state.levels[i])) {
			return i;
		}
	}
	return -1;
}

function getFirstSectionAutoLevelIndex(sectionName) {
	if (!state || !Array.isArray(state.levels)) {
		return -1;
	}
	for (let i = 0; i < state.levels.length; i++) {
		const leveldat = state.levels[i];
		if (!leveldat || leveldat.section !== sectionName) {
			continue;
		}
		if (isHiddenLabeledLevel(leveldat)) {
			continue;
		}
		return i;
	}
	return -1;
}

function sectionHasVisibleMapLevel(sectionName) {
	if (!state || !Array.isArray(state.levels)) {
		return false;
	}
	for (let i = 0; i < state.levels.length; i++) {
		const leveldat = state.levels[i];
		if (!leveldat || leveldat.section !== sectionName) {
			continue;
		}
		if (!isMapLevelEntry(leveldat)) {
			continue;
		}
		if (!isHiddenLabeledLevel(leveldat)) {
			return true;
		}
	}
	return false;
}

function isSectionProgressTarget(section) {
	if (!section || section.isDirectory) {
		return false;
	}
	if (!state || !state.metadata || !state.metadata.hide_labeled_levels) {
		return true;
	}
	return sectionHasVisibleMapLevel(section.name);
}

function getSectionSolveTargets() {
	if (!state || !Array.isArray(state.sections)) {
		return [];
	}
	const hasDirectoryInfo = state.sections.some(s => typeof s.isDirectory === "boolean");
	const candidateSections = hasDirectoryInfo
		? state.sections.filter(s => !s.isDirectory)
		: state.sections.slice();
	return candidateSections.filter(isSectionProgressTarget);
}

function getSolvedTargetSectionCount() {
	const targets = getSectionSolveTargets();
	let count = 0;
	for (const section of targets) {
		if (solvedSections.indexOf(section.name) >= 0) {
			count++;
		}
	}
	return count;
}

function hasSolvedAllTargetSections() {
	const targets = getSectionSolveTargets();
	if (targets.length === 0) {
		return false;
	}
	return getSolvedTargetSectionCount() >= targets.length;
}

function hasFinishedTheGame() {
	return state.metadata.level_select && hasSolvedAllTargetSections()
		|| curLevelNo >= state.levels.length; 
}

function hasSolvedAtLeastOneSection() {
	return state.metadata.level_select && getSolvedTargetSectionCount() > 0;
}

// call this before a new compile
function unloadGame() {
	state=introState;
	curLevel = new Level(0, 5, 5, 2, null, null);
	curLevel.objects = new Int32Array(0);
	levelEditorOpened = false;
	generateTitleScreen();
	canvasResize();
	//redraw();
	titleMode = 0;
	titleSelected=true;
}

function isContinueOptionSelected() {
	return state.metadata.skip_title_screen || (!state.metadata.continue_is_level_select && titleSelection == MENUITEM_CONTINUE);
}

function isNewGameOptionSelected() {
	return titleSelection == MENUITEM_NEWGAME || titleSelection == MENUITEM_STARTGAME;
}

function isLevelSelectOptionSelected() {
	return state.metadata.continue_is_level_select && titleSelection == MENUITEM_CONTINUE || titleSelection == MENUITEM_LEVELSELECT;
}

function generateTitleScreen(hoverLine, scrollIncrement, selectLine) {
	if (debugSwitch.includes('menu')) console.log(`generateTitleScreen()`, 'hoverLine=', hoverLine, 'scrollIncrement=', scrollIncrement, 'selectLine=' , selectLine);
	lineColorOverride = [];
  	tryLoadCustomFont();

	titleMode=showContinueOptionOnTitleScreen()?1:0;

	if (state.levels.length===0) {
		titleImage = fillAndHighlight(getIntroScreen("Please select a game"));
		return;
  	}

    if (isSitelocked()) {
		titleImage = fillAndHighlight(getIntroScreen("This game is sitelocked!"));
		return;
	}

	if (titleMode===0) {
		const screen = getStartScreen([ MENUITEM_STARTGAME ]);
		titleImage = selectLine ? fillAndHighlight(screen, -1, -1, screen.options[0]) : fillAndHighlight(screen, screen.options[0]);
		titleSelection = selectLine ? MENUITEM_STARTGAME : null;
	} else {
		const playedGameBefore = hasStartedTheGame() || hasSolvedAtLeastOneSection()
		const options = [];
		options.push(playedGameBefore && !hasFinishedTheGame() ? MENUITEM_CONTINUE : MENUITEM_NEWGAME);
		if(state.metadata.level_select && (!state.metadata.continue_is_level_select || !playedGameBefore))
			options.push(MENUITEM_LEVELSELECT);
		if (playedGameBefore && !hasFinishedTheGame()) {
			options.push(MENUITEM_NEWGAME);
		}

		const screen = getStartScreen(options);
		if (levelSelectScrollPos == 0)
			levelSelectScrollPos = screen.options[0];
		else if (scrollIncrement && screen.options.includes(levelSelectScrollPos + scrollIncrement))
			levelSelectScrollPos += scrollIncrement;

		titleImage = fillAndHighlight(screen, levelSelectScrollPos, hoverLine, selectLine);
		const select = selectLine || hoverLine;
		titleSelection = screen.options.includes(select) ? options[screen.options.indexOf(select)] : false;  // todo: ???
	}
	if (debugSwitch.includes('menu')) console.log(`generateTitleScreen2`, `titleSelection=`, titleSelection, `levelSelectScrollPos=`, levelSelectScrollPos);

	const setImage = (n,text) => {
		if (!text) throw "image";
		titleImage[n] = text.padEnd(TITLE_WIDTH);
		if (state.keyhint_color) 
			lineColorOverride[n] = state.keyhint_color;
	}
	const getActionHint = () => {
		if (state.metadata.noaction) {
			return " X to select";
		}
		const keys = ["X"];
		if (Array.isArray(state.actionKeyOrder) && state.actionKeyLabels) {
			for (const keyCode of state.actionKeyOrder) {
				const label = state.actionKeyLabels[keyCode];
				if (!label) {
					continue;
				}
				const upper = String(label).toUpperCase();
				if (!keys.includes(upper)) {
					keys.push(upper);
				}
			}
		}
		return ` ${keys.join(",")} to action`;
	}
	if (state.metadata.text_controls) {
		const text = wordwrap(state.metadata.text_controls, TITLE_WIDTH, true);
		text.slice(0, 3).forEach((t,x) => {
			setImage(10 + x, t);
		})
	} else {
		const tclick = state.metadata.mouse_drag || state.metadata.mouse_rdrag ? " Click, Tap, or Drag to interact" : " Click or Tap to interact";
		setImage(10, IsMouseGameInputEnabled() ? tclick : " Arrow keys or WASD to move");
		setImage(11, getActionHint() + (state.metadata.norestart ? "" : ", R to restart"));
		const tundo = IsMouseGameInputEnabled() ? " Z or Middle Mouse Button to undo" : " Z to undo";
		setImage(12, (state.metadata.noundo ? " " : tundo));
	}

	const title = state.metadata.title || "PuzzleScript Next Game";

	const titleSplit = wordwrap(title, TITLE_WIDTH);
	const maxl = state.metadata.author ? 2 : 4;
	if (titleSplit.length > maxl) {
		titleSplit.splice(maxl);
		if (!hoverLine)
			logWarning(`Game title is too long to fit on screen, truncating to ${maxl} lines.`, state.metadata_lines.title, true);
	}
	titleSplit.forEach((line,x) => {
		titleImage[1 + x] = centerText(line.trim(), TITLE_WIDTH);
		if (state.title_color)
			lineColorOverride[1 + x] = state.title_color;
	});

	if (state.metadata.author) {
		const split = wordwrap("by " + state.metadata.author, TITLE_WIDTH);
		if (split.length > 2){
			split.splice(2);
			if (!hoverLine)
				logWarning("Author list too long to fit on screen, truncating to 2 lines.",state.metadata_lines.author, true);
		}
		split.forEach((line, x) => { 
			titleImage[3 + x]=line.trim().padStart(TITLE_WIDTH);
			if (state.author_color)
				lineColorOverride[3 + x] = state.author_color;
		});
	}
	redraw();
}

function goToPauseScreen() {
	// todo: de-yuck!
	levelSelectScrollPos = 0;
	titleSelected = false;
	timer = 0;
	quittingTitleScreen = false;
	quittingMessageScreen = false;
	titleMode = 3;
	titleScreen = true;
	textMode = true;
	if (againing)
		DoUndo(true, false);
    againing = false;
	messagetext = "";

	generatePauseScreen();
}

function generatePauseScreen(hoverLine, scrollIncrement, selectLine) {
	if (debugSwitch.includes('menu')) console.log(`generatePauseScreen()`, hoverLine, scrollIncrement, selectLine);
	const screen = getPauseScreen(state);

	if (levelSelectScrollPos == 0)
		levelSelectScrollPos = screen.options[0];
	else if (scrollIncrement && screen.options.includes(levelSelectScrollPos + scrollIncrement))
		levelSelectScrollPos += scrollIncrement;

	titleImage = fillAndHighlight(screen, levelSelectScrollPos, hoverLine, selectLine);
	pauseSelection = (hoverLine >= 0 ? hoverLine : selectLine >= 0 ? selectLine : 0) - screen.options[0];
	redraw();
}

function selectPauseScreen(lineNo) { 
	const options = [
		() => {
			titleScreen = false;
			if (state.levels[curLevelNo].message) {
				drawMessageScreen(state.levels[curLevelNo].message);
			} else {
				textMode = false;
				canvasResize();
			}
		},
		!state.metadata.norestart ? () => {
			DoRestart();
			textMode = false;
			titleScreen = false;
			canvasResize();
		} : null,
		state.metadata.level_select ? () => {
			titleSelection = null;
			gotoLevelSelectScreen();
		} : null,
		() => {
			goToTitleScreen();
		}
	].filter(l => l != null);

	if (pauseSelection >= 0 && pauseSelection < options.length)
		options[pauseSelection]();
}

function centerText(text, len, fill = " ") {
	return !text ? fill.repeat(len)
		: text.length >= len ? text.slice(0, len)
		: (fill.repeat(~~((len - text.length) / 2)) + text).padEnd(len, fill);
}

function padToSize(textLines, width, height) {
	const lines = textLines.map(l => l.padEnd(width));
	while (lines.length < height) 
		lines.push("");
	return lines;
}

// return an array filled with integers from start to finish-1
function fillRange(start, finish) {
	return Array(finish - start).fill().map((item, index) => start + index);
};

function fillAndHighlight(image, highlight, hover, select) {
	const ll = image.lines.map((l,x) => 
		x == select && image.options.includes(x) ? centerText(`# ${l} #`, TITLE_WIDTH, "#") :
		x == hover && image.options.includes(x) ? centerText(`> ${l} <`, TITLE_WIDTH) : 
		x == highlight && image.options.includes(x) ? centerText(`# ${l} #`, TITLE_WIDTH) :
		centerText(l, TITLE_WIDTH));
	return padToSize(ll, TITLE_WIDTH, TITLE_HEIGHT);
}

let levelSelectScrollPos = 0;
let levelHighlightLine = 0;
let levelSelectCurrentParent = -1;
let levelSelectEntries = [];

function getSectionDisplayName(section) {
	if (!section) return "";
	const name = (section.displayName !== undefined) ? section.displayName : section.name;
	return (name === undefined || name === null) ? "" : String(name);
}

function getSectionParentIndex(sectionIndex) {
	const section = state.sections[sectionIndex];
	if (!section) return -1;
	return (typeof section.parentSection === "number") ? section.parentSection : -1;
}

function getSectionChildren(sectionIndex) {
	if (!Array.isArray(state.sections)) {
		return [];
	}
	const section = state.sections[sectionIndex];
	if (!section) {
		return [];
	}
	if (Array.isArray(section.childSections)) {
		return section.childSections.slice();
	}
	return state.sections
		.map((s, i) => ({ s, i }))
		.filter(x => x.i !== sectionIndex && x.s.parentSection === sectionIndex)
		.map(x => x.i);
}

function getSectionEntriesForParent(parentIndex) {
	if (!Array.isArray(state.sections)) {
		return [];
	}

	// Backward compatible: if hierarchy data is missing, keep flat list behaviour.
	const hasHierarchy = state.sections.some(s => typeof s.parentSection === "number");
	if (!hasHierarchy) {
		return state.sections
			.map((_, i) => i)
			.filter(sectionAppearsInLevelSelect);
	}

	let entries;
	if (parentIndex >= 0 && state.sections[parentIndex]) {
		entries = getSectionChildren(parentIndex);
	} else {
		entries = state.sections
			.map((s, i) => ({ s, i }))
			.filter(x => (x.s.parentSection === -1 || x.s.parentSection === undefined))
			.map(x => x.i);
	}

	return entries.filter(sectionAppearsInLevelSelect);
}

function refreshLevelSelectEntries() {
	levelSelectEntries = getSectionEntriesForParent(levelSelectCurrentParent);
	return levelSelectEntries;
}

function sectionHasChildren(sectionIndex) {
	return getSectionChildren(sectionIndex).length > 0;
}

function sectionAppearsInLevelSelect(sectionIndex) {
	const section = Array.isArray(state.sections) ? state.sections[sectionIndex] : null;
	if (!section) {
		return false;
	}
	if (!state || !state.metadata || !state.metadata.hide_labeled_levels) {
		return true;
	}
	if (sectionHasChildren(sectionIndex)) {
		const children = getSectionChildren(sectionIndex);
		return children.some(sectionAppearsInLevelSelect);
	}
	return getFirstSectionAutoLevelIndex(section.name) >= 0;
}

function isSectionSolvedForLevelSelect(sectionIndex, memo = new Map(), stack = new Set()) {
	if (memo.has(sectionIndex)) {
		return memo.get(sectionIndex);
	}
	const section = Array.isArray(state.sections) ? state.sections[sectionIndex] : null;
	if (!section) {
		return false;
	}
	if (stack.has(sectionIndex)) {
		return false;
	}
	stack.add(sectionIndex);
	let solved = false;
	const children = getSectionChildren(sectionIndex).filter(sectionAppearsInLevelSelect);
	if (children.length > 0) {
		solved = children.every(childIndex => isSectionSolvedForLevelSelect(childIndex, memo, stack));
	} else {
		solved = solvedSections.indexOf(section.name) >= 0;
	}
	stack.delete(sectionIndex);
	memo.set(sectionIndex, solved);
	return solved;
}

function levelSelectEnterDirectory(sectionIndex) {
	if (sectionIndex == null || sectionIndex < 0 || !sectionHasChildren(sectionIndex)) {
		return false;
	}
	levelSelectCurrentParent = sectionIndex;
	levelSelectScrollPos = 0;
	levelHighlightLine = 0;
	titleSelection = null;
	titleSelected = false;
	quittingTitleScreen = false;
	timer = 0;
	generateLevelSelectScreen();
	return true;
}

function levelSelectGoBack() {
	if (levelSelectCurrentParent < 0) {
		return false;
	}
	levelSelectCurrentParent = getSectionParentIndex(levelSelectCurrentParent);
	levelSelectScrollPos = 0;
	levelHighlightLine = 0;
	titleSelection = null;
	titleSelected = false;
	quittingTitleScreen = false;
	timer = 0;
	generateLevelSelectScreen();
	return true;
}

function gotoLevelSelectScreen() {
	if(!state.metadata.level_select) {
		goToTitleScreen();
		return;
	}
	levelSelectScrollPos = 0;
	levelHighlightLine = 0;
	levelSelectCurrentParent = -1;
	titleSelected = false;
	timer = 0;
	quittingTitleScreen = false;
	quittingMessageScreen = false;
	titleMode = 2;
	titleScreen = true;
	textMode = true;
    againing = false;
	messagetext = "";

	let preferredSection = null;
	if (titleSelection == null) {
		for(var i = 0; i < state.sections.length; i++) {
			if(state.sections[i].firstLevel > curLevelNo) {
				preferredSection = Math.max(0,i-1);
				break;
			}
		}
		if (preferredSection == null && state.sections.length > 0) {
			preferredSection = state.sections.length - 1;
		}
	} else if (typeof titleSelection === "number") {
		preferredSection = titleSelection;
	}

	if (preferredSection != null && state.sections[preferredSection]) {
		levelSelectCurrentParent = getSectionParentIndex(preferredSection);
		titleSelection = preferredSection;
	}
  
  	state.metadata = deepClone(state.default_metadata);
  	twiddleMetadataExtras();

	generateLevelSelectScreen();
}

function generateLevelSelectScreen(hoverLine, scrollIncrement, selectLine) { 
	if (debugSwitch.includes('menu')) console.log('generateLevelSelectScreen{ ', 'hoverLine=', hoverLine, 'scrollIncrement=', scrollIncrement, 'selectLine=', selectLine);
	lineColorOverride = [];
	const entries = refreshLevelSelectEntries();

	// set initial highlight to current level
	amountOfLevelsOnScreen = Math.min(9, entries.length);
	if (entries.length === 0) {
		const screen = getLevelSelectScreen(["(empty)"]);
		titleImage = fillAndHighlight(screen, -1, hoverLine, -1);
		titleSelection = null;
		const escText = levelSelectCurrentParent >= 0 ? "ESC:Up" : "ESC:Back";
		titleImage[0] = (hoverLine == 0 ? `[  ${escText}  ]` : ` [ ${escText} ] `).padEnd(TITLE_WIDTH);
		if (levelSelectCurrentParent >= 0) {
			const parent = state.sections[levelSelectCurrentParent];
			titleImage[1] = centerText(getSectionDisplayName(parent), TITLE_WIDTH);
		}
		redraw();
		return;
	}

	if (entries.indexOf(titleSelection) < 0) {
		titleSelection = entries[0];
	}

	let selectedEntryPos = entries.indexOf(titleSelection);
	if(selectedEntryPos < levelSelectScrollPos) { //Up
		levelSelectScrollPos = selectedEntryPos;
	} else if(selectedEntryPos >= levelSelectScrollPos + amountOfLevelsOnScreen) { //Down
		levelSelectScrollPos = selectedEntryPos - amountOfLevelsOnScreen + 1;
	}

	let unlockedUntilProgress = -1;
	let progressOrderBySection = new Map();
	if (state.metadata.level_select_lock) {
		const progressSections = [];
		for (let i = 0; i < state.sections.length; i++) {
			if (isSectionProgressTarget(state.sections[i])) {
				progressOrderBySection.set(i, progressSections.length);
				progressSections.push(i);
			}
		}

		let lastSolvedProgress = -1;
		for (let p = 0; p < progressSections.length; p++) {
			const sectionIndex = progressSections[p];
			if (solvedSections.indexOf(state.sections[sectionIndex].name) >= 0) {
				lastSolvedProgress = p;
			}
		}

		if(state.metadata.level_select_unlocked_ahead !== undefined) {
			unlockedUntilProgress = lastSolvedProgress + state.metadata.level_select_unlocked_ahead;
		} else if (state.metadata.level_select_unlocked_rollover !== undefined) {
			unlockedUntilProgress = getSolvedTargetSectionCount() + state.metadata.level_select_unlocked_rollover - 1;
		} else {
			unlockedUntilProgress = lastSolvedProgress + 1;
		}
	}

	//console.log(`levelHighlightLine=${levelHighlightLine} titleSelection=${titleSelection} levelSelectScrollPos=${levelSelectScrollPos}`)
	if (levelHighlightLine == 0 || levelHighlightLine < 3 || levelHighlightLine > 3 + amountOfLevelsOnScreen - 1)
		levelHighlightLine = 3 + selectedEntryPos - levelSelectScrollPos;
	else if (levelHighlightLine > 3 && scrollIncrement < 0)
		levelHighlightLine--;
	else if (levelHighlightLine < 3 + amountOfLevelsOnScreen - 1 && scrollIncrement > 0)
		levelHighlightLine++;
	else if (levelSelectScrollPos > 0 && (levelHighlightLine == 3 || scrollIncrement < 0))
		levelSelectScrollPos--;
	else if (levelSelectScrollPos + amountOfLevelsOnScreen < entries.length 
			 && (levelHighlightLine == 11 || scrollIncrement > 0) && !titleSelected)
		levelSelectScrollPos++;

	selectedEntryPos = Math.max(0, Math.min(entries.length - 1, levelHighlightLine - 3 + levelSelectScrollPos));
	titleSelection = entries[selectedEntryPos];

	const solved_symbol = state.metadata.level_select_solve_symbol || "X";
	const solvedMemo = new Map();

	const lines = entries.map((sectionIndex, i) => {
		const section = state.sections[sectionIndex];
		const isDirectory = sectionHasChildren(sectionIndex);
		const solved = isSectionSolvedForLevelSelect(sectionIndex, solvedMemo);
		const selected = (i == selectLine + levelSelectScrollPos - 3);
		const progressOrder = progressOrderBySection.get(sectionIndex);
		const locked = (progressOrder !== undefined && unlockedUntilProgress >= 0 && progressOrder > unlockedUntilProgress);
		const rawName = getSectionDisplayName(section).substring(0, 24);
		let name = locked ? "*".repeat(rawName.length) : rawName;
		if (!locked && isDirectory) {
			name = (name + "/").substring(0, 24);
		}
		//console.log(section, `i=${i} solved=${solved} locked=${locked} selected=${selected}`);

		// kludge to avoid selecting locked level
		if (selected && locked) {
			selectLine = -1;
			titleSelected = false;
			quittingTitleScreen = false;
			//TryPlayLockedSound();
		}
		
		if (selected && !locked) {
			if (i >= levelSelectScrollPos && i < levelSelectScrollPos + amountOfLevelsOnScreen) {
				titleSelection = sectionIndex;
			}
			return (solved ? solved_symbol : " ") + "#" + name.padEnd(24);
		}
		return (solved ? solved_symbol : " ") + " " + name.padEnd(24);
	});

	const showLines = lines.slice(levelSelectScrollPos,levelSelectScrollPos + amountOfLevelsOnScreen);
	const screen = getLevelSelectScreen(showLines);
	if (debugSwitch.includes('menu')) console.log(`generateLevelSelectScreen2 titleSelection=${titleSelection}`, `levelSelectScrollPos=${levelSelectScrollPos}`, screen);
	titleImage = fillAndHighlight(screen, levelHighlightLine, hoverLine, selectLine);

	const backLabel = levelSelectCurrentParent >= 0 ? "[ ESC:Up ] " : " [ ESC:Back ] ";
	titleImage[0] = (hoverLine == 0 ? (levelSelectCurrentParent >= 0 ? "[  ESC:Up  ]" : "[  ESC:Back  ]") : backLabel).padEnd(TITLE_WIDTH);
	if (levelSelectCurrentParent >= 0) {
		const parent = state.sections[levelSelectCurrentParent];
		titleImage[1] = centerText(getSectionDisplayName(parent), TITLE_WIDTH);
	}
	if (levelSelectScrollPos > 0)
		titleImage[2] = (hoverLine == 2 ? "[  PREV  ]" : "[ PREV ] ").padStart(TITLE_WIDTH);
	if (levelSelectScrollPos + amountOfLevelsOnScreen < entries.length)
		titleImage[12] = (hoverLine == 12 ? "[  NEXT  ]" : "[ NEXT ] ").padStart(TITLE_WIDTH);
	redraw();
}

// go to level: <-1 for level index, >0 for section index, -9999 had compile error
function gotoLevel(index) {
	if (debugSwitch.includes('load')) console.log(`gotoLevel(${index})`);
	if (solving) return;
	if (index == -9999) return;  // It's an invalid GOTO

	if (index >= 0 && titleScreen && titleMode == 2 && sectionHasChildren(index)) {
		levelSelectEnterDirectory(index);
		canvasResize();
		return;
	}
  
	againing = false;
	messagetext = "";
	statusText = "";

	if (index == 'levelall') {
		//curLevelNo = -1; //???
		curLevel = levelAllObjects(state);
	} else {
		if (index >= 0) {
			const targetSection = state.sections[index];
			if (!targetSection || targetSection.firstLevel == null || targetSection.firstLevel < 0) {
				if (debugSwitch.includes('menu')) console.log(`gotoLevel skipped empty section`, index, targetSection);
				return;
			}
			const sectionStart = getFirstSectionAutoLevelIndex(targetSection.name);
			curLevelNo = sectionStart >= 0 ? sectionStart : targetSection.firstLevel;
			if (curLevelNo < 0) {
				if (debugSwitch.includes('menu')) console.log(`gotoLevel skipped hidden section`, index, targetSection);
				return;
			}
		} else {
			curLevelNo = -1 - index;
		}
		curlevelTarget = null; // #164
		loadLevelFromStateOrTarget();
	}
	updateLocalStorage();
	resetFlickDat();
	canvasResize();	
	clearInputHistory();
	processLevelInput();
}

function resolveLinkTargetLevelNo(targetNo) {
	if (!state || !Array.isArray(state.levels) || !isFinite(targetNo)) {
		return -1;
	}
	if (targetNo === -9999) {
		return -1;
	}
	if (targetNo >= 0) {
		if (!Array.isArray(state.sections) || targetNo >= state.sections.length) {
			return -1;
		}
		const targetSection = state.sections[targetNo];
		if (!targetSection || targetSection.firstLevel == null || targetSection.firstLevel < 0) {
			return -1;
		}
		const sectionStart = getFirstSectionAutoLevelIndex(targetSection.name);
		const resolved = sectionStart >= 0 ? sectionStart : targetSection.firstLevel;
		return (resolved >= 0 && resolved < state.levels.length) ? resolved : -1;
	}
	const resolved = -1 - targetNo;
	return (resolved >= 0 && resolved < state.levels.length) ? resolved : -1;
}

function cacheExtraBoardLinkTargets(level = curLevel, sourceLevelDat = null) {
	if (!state || !state.extraBoardEnabled || !level || !Array.isArray(state.links)) {
		return;
	}
	let visibleLinkCount = isFinite(level.linksTop) ? Math.max(0, level.linksTop | 0) : 0;
	if (visibleLinkCount === 0 && sourceLevelDat && isFinite(sourceLevelDat.linksTop)) {
		visibleLinkCount = Math.max(0, sourceLevelDat.linksTop | 0);
	}
	if (visibleLinkCount === 0 && isFinite(curLevelNo) && state.levels && state.levels[curLevelNo] && isFinite(state.levels[curLevelNo].linksTop)) {
		visibleLinkCount = Math.max(0, state.levels[curLevelNo].linksTop | 0);
	}
	if (visibleLinkCount === 0) {
		return;
	}
	const visibleLinks = state.links.slice(0, visibleLinkCount).reverse();
	if (visibleLinks.length === 0) {
		return;
	}

	const getLinkMatchNames = function(linkObject) {
		const names = [];
		let objectName = null;
		let baseId = null;

		if (typeof linkObject === 'string') {
			objectName = linkObject;
			if (state.objects && state.objects[linkObject] && isFinite(state.objects[linkObject].id)) {
				baseId = state.objects[linkObject].id | 0;
			}
		} else if (isFinite(linkObject) && !isNaN(linkObject)) {
			const numericId = linkObject | 0;
			if (state.idDict && state.idDict[numericId] !== undefined) {
				objectName = state.idDict[numericId];
			}
			if (state.baseIdByExtraId && state.baseIdByExtraId[numericId] !== undefined) {
				baseId = state.baseIdByExtraId[numericId] | 0;
			} else {
				baseId = numericId;
			}
		}

		if (objectName) {
			names.push(objectName);
		}
		if (baseId !== null && state.extraIdByBaseId && state.extraIdByBaseId[baseId] !== undefined) {
			const extraId = state.extraIdByBaseId[baseId] | 0;
			if (state.idDict && state.idDict[extraId] !== undefined) {
				names.push(state.idDict[extraId]);
			}
		}

		return Array.from(new Set(names));
	};

	const extraBounds = getExtraBoardBounds(level);
	const store = ensureExtraCellStates(level);
	for (let x = 0; x < extraBounds.width; x++) {
		for (let y = 0; y < extraBounds.height; y++) {
			const idx = y + x * level.height;
			const objids = level.getObjects(idx);
			let matched = null;
			for (const link of visibleLinks) {
				const matchNames = getLinkMatchNames(link.object);
				if (matchNames.some(name => objids.includes(name))) {
					matched = link;
					break;
				}
			}
			if (!matched) {
				continue;
			}
			const targetLevelNo = resolveLinkTargetLevelNo(matched.targetNo);
			if (targetLevelNo < 0) {
				continue;
			}
			const targetLevel = state.levels[targetLevelNo];
			if (!isMapLevelEntry(targetLevel)) {
				continue;
			}
			const snapshot = captureMainBoardState(targetLevel);
			if (!snapshot) {
				continue;
			}
			store[`${x},${y}`] = snapshot;
		}
	}
}
  
function gotoLink() {
	if (debugSwitch.includes('load')) console.log('gotoLink()', `stack:`, linkStack);
  	if (solving) return;
	for (const position of playerPositions) {
		const level = state.levels[curLevelNo];
		if (state && state.extraBoardEnabled && getExtraCellKeyFromIndex(position, curLevel) !== null) {
			continue;
		}
		const objids = level.getObjects(position);
		for (const link of state.links // use the most recent visible link definition
				.slice(0, level.linksTop)
				.reverse()) {
			if (objids.includes(link.object)) {
				const linkEntry = { 
					backup: backupLevel(), 		// will restore to this
					backupTop: backups.length 	// will prune to this
				};
				linkStack.push(linkEntry);
				gotoLevel(link.targetNo);
				return;
			}
		}
  	}  
}

function returnLink() {
	if (debugSwitch.includes('load')) console.log('returnLink()', `stack:`, linkStack);
	const linkEntry = linkStack.pop();
	const level = state.levels[linkEntry.backup.levelNo];
	backups = backups.slice(0, linkEntry.backupTop);
	if (verbose_logging)
		consolePrint(`Returning to level ${linkEntry.backup.levelNo} (${htmlJump(level.lineNumber)}).`, true, level.lineNumber);
	restoreLevel(linkEntry.backup);
	updateLocalStorage();
	resetFlickDat();
	canvasResize();	
	clearInputHistory();
}

let introState = {
  	title: "Empty Game",
  	attribution: "polyomino",
    objectCount: 2,
    metadata:[],
    levels:[],
	collisionLayerGroups: [],
    bgcolor:"#000000",
    fgcolor:"#FFFFFF"
};

var state = introState;

function deepClone(item) {
    if (!item) { return item; } // null, undefined values check

    var types = [ Number, String, Boolean ], 
        result;

    // normalizing primitives if someone did new String('aaa'), or new Number('444');
    types.forEach(function(type) {
        if (item instanceof type) {
            result = type( item );
        }
    });

    if (typeof result == "undefined") {
        if (Object.prototype.toString.call( item ) === "[object Array]") {
            result = [];
            item.forEach(function(child, index, array) { 
                result[index] = deepClone( child );
            });
        } else if (typeof item == "object") {
            // testing that this is DOM
            if (item.nodeType && typeof item.cloneNode == "function") {
                var result = item.cloneNode( true );    
            } else if (!item.prototype) { // check that this is a literal
                if (item instanceof Date) {
                    result = new Date(item);
                } else {
                    // it is an object literal
                    result = {};
                    for (var i in item) {
                        result[i] = deepClone( item[i] );
                    }
                }
            } else {
                // depending what you would like here,
                // just keep the reference, or create new object
/*                if (false && item.constructor) {
                    // would not advice to do that, reason? Read below
                    result = new item.constructor();
                } else */{
                    result = item;
                }
            }
        } else {
            result = item;
        }
    }

    return result;
}

function wordwrap( str, width, handleNewlines = false ) {
 
    width = width || 75;
    var cut = true;
 
	if (!str) return [ ];
 
	var regex = '.{1,' +width+ '}(\\s|$)' + (cut ? '|.{' +width+ '}|.+$' : '|\\S+?(\\s|$)');

	if (!handleNewlines) {
	
		return str.match( RegExp(regex, 'g') );
	} else {
		splitNewlines = str.split("\\n");
		var splitString  = [];
	
		splitNewlines.forEach(splitStr => {
			splitString = splitString.concat(splitStr.match( RegExp(regex, 'g') ));
		}) 
		
		//console.log(splitString);
		return splitString;
	}
 
}

var splitMessage=[];
function drawMessageScreen(message) {
	lineColorOverride = [];
	tryLoadCustomFont();
	titleMode=0;
	textMode=true;

	const screen = getMessageScreen(
		quittingMessageScreen ? "" 
		: state.metadata.text_message_continue ? state.metadata.text_message_continue
		: IsMouseGameInputEnabled() ? "Click or X to continue" : "X to continue");

	titleImage = fillAndHighlight(screen);
	if (state.keyhint_color)
		lineColorOverride[screen.options[0]] = state.keyhint_color;

	const splitMessage = wordwrap(message, TITLE_WIDTH, true);

	const lines = splitMessage.map(m => {
		return state.metadata.message_text_align == 'left' ? m.padEnd(TITLE_WIDTH)
		: state.metadata.message_text_align == 'right' ? m.padStart(TITLE_WIDTH)
		: centerText(m, TITLE_WIDTH);
	})

	lines.length = Math.min(lines.length, 12);
	const offset = 5 - ~~(lines.length / 2);

	lines.forEach((line,x) => {
		titleImage[x + offset] = line;
	})
 
  	canvasResize();
}

var loadedLevelSeed=0;

// workhorse to load and setup a new level
function loadLevelFromLevelDat(state,leveldat,randomseed,clearinputhistory) {	
	if (debugSwitch.includes('load')) console.log(`loadLevelFromLevelDat()`, leveldat);
	if (randomseed==null) {
		randomseed = (Math.random() + Date.now()).toString();
	}
	loadedLevelSeed = randomseed;
	RandomGen = new RNG(loadedLevelSeed);
	forceRegenImages=true;			// forces canvasResize to generate images
	ignoreNotJustPressedAction=true;
	titleScreen=false;
	titleMode=showContinueOptionOnTitleScreen()?1:0;
	titleSelection=0;
  	titleSelected=false;
  	dragging = false;
  	rightdragging = false;
  	state.metadata = deepClone(state.default_metadata);
    againing=false;
	suppressInput = false;
	reset3DCameraIfAvailable();
    if (leveldat===undefined) {
    	consolePrint("Trying to access a level that doesn't exist.",true);
		curLevelNo = 0;  // bad level from storage, needs to be reset in case of skip_title_screen
		goToTitleScreen();
    	return;
    }
    if (leveldat.message) {
      	// This "level" is actually a message.
		if (verbose_logging)
			consolePrint(`Showing message (${htmlJump(leveldat.lineNumber)})`, true, leveldat.lineNumber);
      	ignoreNotJustPressedAction=true;
	  	tryPlayShowMessageSound();
	  	twiddleMetadataExtras();
      	drawMessageScreen(leveldat.message);
		messageselected = false;
      	canvasResize();
      	clearInputHistory();
    } else if (leveldat.target != undefined) {  // could be zero
		if (verbose_logging)
			consolePrint(`GOTO (${htmlJump(leveldat.lineNumber)})`, true, leveldat.lineNumber);
      	// This "level" is actually a goto.
      	//tryPlayGotoSound();
      	setSectionSolved(state.levels[curLevelNo].section)
      	gotoLevel(leveldat.target);
    } else {
      	titleMode=0;
      	textMode=false;
    	curLevel = leveldat.clone();
		if (state.extraBoardEnabled) {
			cacheExtraBoardLinkTargets(curLevel, leveldat);
		}
		if (verbose_logging)
			consolePrint(`Loading "${leveldat.section || leveldat.title}" (${htmlJump(leveldat.lineNumber)}).`, true, leveldat.lineNumber);  //todo:
    	RebuildLevelArrays();
        if (state!==undefined) {
	        if (state.metadata.flickscreen!==undefined){
	            oldflickscreendat=[
	            	0,
	            	0,
	            	Math.min(state.metadata.flickscreen[0],curLevel.width),
	            	Math.min(state.metadata.flickscreen[1],curLevel.height)
	            ];
	        } else if (state.metadata.zoomscreen!==undefined){
	            oldflickscreendat=[
	            	0,
	            	0,
	            	Math.min(state.metadata.zoomscreen[0],curLevel.width),
	            	Math.min(state.metadata.zoomscreen[1],curLevel.height)
	            ];
	        } else if (state.metadata.smoothscreen!==undefined){
	            oldflickscreendat=[
	            	0,
	            	0,
	            	Math.min(state.metadata.smoothscreen.screenSize.width,curLevel.width),
	            	Math.min(state.metadata.smoothscreen.screenSize.height,curLevel.height)
	            ];
	        }
        }

      	initSmoothCamera();
      	twiddleMetadataExtras();

		if (!state.metadata.allow_undo_level)
	    	backups = [];
		restartTarget=backupLevel();
		keybuffer=[];

	    if ('run_rules_on_level_start' in state.metadata) {
			runrulesonlevelstart_phase=true;
			processInput(-1,true);
			runrulesonlevelstart_phase=false;
	    }
	}

	if (clearinputhistory===true){
		clearInputHistory();
	}
}

function loadLevelFromStateTarget(state,levelindex,target,randomseed) { 
	if (debugSwitch.includes('load')) console.log(`loadLevelFromStateTarget(${levelindex},${target})`);
    var leveldat = target;    
	if (verbose_logging)
		consolePrint(`Returning to checkpoint in "${state.levels[levelindex].section || state.levels[levelindex].title}".`); 
  	curLevelNo=levelindex;
  	curlevelTarget=target;
    if (leveldat.message===undefined) {
      	if (levelindex=== 0){ 
			tryPlayStartGameSound();
			//tryPlayStartLevelSound();     
		} else {
			tryPlayStartLevelSound();     
		}
    }
    loadLevelFromLevelDat(state,state.levels[levelindex],randomseed);
    restoreLevel(target, true);
    restartTarget=target;
}

function loadLevelFromState(state,levelindex,randomseed) {  
	if (debugSwitch.includes('load')) console.log(`loadLevelFromState(levelindex=${levelindex})`);
	var leveldat = state.levels[levelindex];    
	curLevelNo=levelindex;
	curlevelTarget=null;
    if (leveldat!==undefined && leveldat.message===undefined) {
		document.dispatchEvent(new CustomEvent("psplusLevelLoaded", {detail: levelindex}));
      	if (levelindex=== 0){ 
      		tryPlayStartLevelSound();
    	} else {
      		tryPlayStartLevelSound();     
    	}
	}

    loadLevelFromLevelDat(state,leveldat,randomseed);
}

var objectSprites = [
{
    color: '#423563',
    dat: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
    ]
},
{
    color: '#252342',
    dat: [
        [0, 0, 1, 0, 0],
        [1, 1, 1, 1, 1],
        [0, 0, 1, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 1, 0, 1, 0]
    ]
}
];

loadedCustomFont = false;

function tryLoadCustomFont() {
	if(state == null || state.metadata == null || state.metadata.custom_font == undefined || loadedCustomFont) {
		return;
	}

	var custom_font = new FontFace('PuzzleCustomFont', 'url('+state.metadata.custom_font+')');
	custom_font.load().then(function(loaded_face) {
		document.fonts.add(loaded_face);
		loadedCustomFont = true;
		canvasResize();
	}).catch(function(error) {alert("Unable to load font!");});
}

tryLoadCustomFont();

let customImages = {};

function tryLoadImages() {
	if (!state.metadata.load_images)
		return;
	customImages = {};

	function regenImages() {
		forceRegenImages = true;
		canvasResize();
	}

	// If there's an issue with the image, it's confusing if nothing at all is drawn to the screen.
	// So while the image is loading, draw solid black. If there was an error loading the image,
	// draw solid red.
	const loadingImage = new Image();
	loadingImage.src = 'data:image/svg+xml;charset=utf-8,' +
		'<svg width="4096" height="4096" xmlns="http://www.w3.org/2000/svg">' +
		'<rect x="0" y="0" width="4096" height="4096" fill="black"/></svg>';
	const errorImage = new Image();
	errorImage.src = 'data:image/svg+xml;charset=utf-8,' +
		'<svg width="4096" height="4096" xmlns="http://www.w3.org/2000/svg">' +
		'<rect x="0" y="0" width="4096" height="4096" fill="red"/></svg>';

	// The format is "name1=src1 name2=src2 ...".
	state.metadata.load_images.split(' ').forEach(arg => {
		let [name, src] = arg.split(/=(.*)/s);
		if (!name || !src) {
			logErrorNoLine(`Expected load_images to be in the form "name1=src1 name2=src2 ...", ` +
				`but I saw "${arg}".`, true);
			return;
		}
		if (verbose_logging)
			consolePrint(`Loading image "${name}" from "${src}..."`);
		customImages[name] = loadingImage;
		let image = new Image();
		image.crossOrigin = 'Anonymous';
		image.src = src;
		image.onload = () => {
			if (verbose_logging)
				consolePrint(`Image "${name}" finished loading.`, true);
			customImages[name] = image;
			regenImages();
		};
		image.onerror = () => {
			logErrorNoLine(`An error occurred while loading image "${name}" from "${src}. ` +
				`Check the browser's developer console for details.`, true);
			customImages[name] = errorImage;
			regenImages();
		};
	});
}

generateTitleScreen();
if (titleMode>0){
	titleSelection=0;
}

canvasResize();

function tryPlaySimpleSound(soundname) {
  if (state.sfx_Events[soundname]!==undefined) {
    var seed = state.sfx_Events[soundname];
		playSeed(seed,true);
  }
}
function tryPlayTitleSound() {
  tryPlaySimpleSound("titlescreen");
}

function tryPlayStartGameSound() {
  tryPlaySimpleSound("startgame");
}

function tryPlayEndGameSound() {
  tryPlaySimpleSound("endgame");
}

function tryPlayCancelSound() {
  tryPlaySimpleSound("cancel");
}

function tryPlayStartLevelSound() {
  tryPlaySimpleSound("startlevel");
}

function tryPlayEndLevelSound() {
  tryPlaySimpleSound("endlevel");
}

function tryPlayUndoSound(){
  tryPlaySimpleSound("undo");
}

function tryPlayRestartSound(){
  tryPlaySimpleSound("restart");
}

function tryPlayShowMessageSound(){
  tryPlaySimpleSound("showmessage");
}

function tryPlayCloseMessageSound(){
  tryPlaySimpleSound("closemessage");
}

var backups=[];
var restartTarget;

function reset3DCameraIfAvailable() {
	if (typeof window !== 'undefined' && typeof window.reset3DCamera === 'function') {
		window.reset3DCamera();
	}
}

// create backup of level data for undo, restart, etc
function backupLevel() {
	const ret = level4Serialization();
	if (state.metadata.runtime_metadata_twiddling !== undefined) {
      	var metadata = deepClone(state.metadata)
      	delete metadata.custom_font;
      	ret.metadata = metadata;
    }
	return ret;
}

function level4Serialization() {
	var ret = {
		dat : Array.from(curLevel.objects),
		width : curLevel.width,
		height : curLevel.height,
		mainBoardWidth: curLevel.mainBoardWidth,
		mainBoardHeight: curLevel.mainBoardHeight,
		extraBoardWidth: curLevel.extraBoardWidth,
		extraBoardHeight: curLevel.extraBoardHeight,
		extraCellStates: deepClone(curLevel.extraCellStates || {}),
		oldflickscreendat: oldflickscreendat.concat([]),
    	cameraPositionTarget: Object.assign({}, cameraPositionTarget),
		levelNo: curLevelNo,
	};
	return ret;
}


// major function to set up game state on start of run
function setGameState(_state, command, randomseed) {
	if (debugSwitch.includes('load')) console.log(`setGameState(${command})`);  //todo:
	oldflickscreendat = [];
	linkStack = [];
	timer = 0;
	autotick = 0;
	winning = false;
	againing = false;
	messageselected = false;
	STRIDE_MOV = _state.STRIDE_MOV;
	STRIDE_OBJ = _state.STRIDE_OBJ;

	sfxCreateMask = new BitVec(STRIDE_OBJ);		// doc: mask for objects that were created
	sfxDestroyMask = new BitVec(STRIDE_OBJ);		// doc: mask for objects that were destroyed

	if (command === undefined) {
		command = ["restart"];
	}
	if ((state.levels.length === 0 || _state.levels.length === 0) && command.length > 0 && command[0] === "rebuild") {
		command = ["restart"];
	}
	if (randomseed === undefined) {
		randomseed = null;
	}
	RandomGen = new RNG(randomseed);

	state = _state;

    if (command[0]!=="rebuild"){
      backups=[];
    }
    if (state.metadata.realtime_interval!==undefined) {
      autotick=0;
      autotickinterval=state.metadata.realtime_interval*1000;
    } else {
      autotick=0;
      autotickinterval=0;
    }

	// set defaults and stay DRY
	twiddleMetadataExtras();
    
	if (throttle_movement && autotickinterval===0) {
      logWarning("throttle_movement is designed for use in conjunction with realtime_interval. Using it in other situations makes games gross and unresponsive, broadly speaking.  Please don't.");
    }
    norepeat_action = state.metadata.norepeat_action!==undefined;

    switch(command[0]){
    	case "restart":
    	{
			reset3DCameraIfAvailable();
		    winning=false;
		    timer=0;
		    titleScreen=true;
		    tryPlayTitleSound();
		    textMode=true;
		    titleSelection=0;
		    titleSelected=false;
			levelSelectScrollPos = 0;		// else level select interferes with title screen
		    quittingMessageScreen=false;
		    quittingTitleScreen=false;
			titleMode = showContinueOptionOnTitleScreen() ? 1 : 0;

			// regenerate text to pick up new colours if any
			regenText();
			tryLoadImages();

			if (state.metadata.skip_title_screen) {
				consolePrint("Skipping title screen.")
				if(state.metadata.continue_is_level_select) {
					gotoLevelSelectScreen();
				}
				else if(titleMode <= 1) {
					nextLevel();
				} else if(titleMode == 2) {
					gotoLevel(titleSelection);
				}
			} else {
				generateTitleScreen();
			}

		    break;
		}
		case "rebuild":
		{
			// The user may have updated an image path.
			tryLoadImages();
			break;
		}
		case "loadFirstNonMessageLevel":{
			for (var i=0;i<state.levels.length;i++){
				if (state.levels[i].message){
					continue;
				}
				var targetLevel = i;
				curLevelNo=targetLevel;
				curlevelTarget=null;
			    winning=false;
			    timer=0;
			    titleScreen=false;
			    textMode=false;
			    titleSelected=false;
			    quittingMessageScreen=false;
			    quittingTitleScreen=false;
			    titleMode = 0;
				showLayers = false;
				loadLevelFromState(state,targetLevel,randomseed);
				break;
			}
			break;	
		}
		case "loadLevel":
		{
			var targetLevel = command[1];
			curLevelNo=targetLevel;
			curlevelTarget=null;
		    winning=false;
		    timer=0;
		    titleScreen=false;
		    textMode=false;
		    titleSelected=false;
		    quittingMessageScreen=false;
		    quittingTitleScreen=false;
		    titleMode = 0;
			showLayers = false;
			loadLevelFromState(state,targetLevel,randomseed);
			break;
		}
		case "levelline":
		{
			var targetLine = command[1];
			for (var i=state.levels.length-1;i>=0;i--) {
				var level= state.levels[i];
				if(level.lineNumber<=targetLine+1) {
					curLevelNo=i;
					curlevelTarget=null;
				    winning=false;
				    timer=0;
				    titleScreen=false;
				    textMode=false;
				    titleSelected=false;
				    quittingMessageScreen=false;
				    quittingTitleScreen=false;
				    titleMode = 0;
					showLayers = false;
					loadLevelFromState(state,i);
					break;
				}
			}
			break;
		}
	}

	if(command[0] !== "rebuild") {
		clearInputHistory();
	}
	canvasResize();

	if (state.sounds.length==0){
		killAudioButton();
	} else {
		showAudioButton();
	}
}

function RebuildLevelArrays() {
  curLevel.movements = new Int32Array(curLevel.n_tiles * STRIDE_MOV);

    curLevel.rigidMovementAppliedMask = [];
    curLevel.rigidGroupIndexMask = [];
	curLevel.rowCellContents = [];
	curLevel.rowCellContents_Movements = [];
	curLevel.colCellContents = [];
	curLevel.colCellContents_Movements = [];
	curLevel.mapCellContents = new BitVec(STRIDE_OBJ);
	curLevel.mapCellContents_Movements = new BitVec(STRIDE_MOV);

	//I have these to avoid dynamic allocation - I generate 3 because why not, 
	//but according to my tests I never seem to call this while a previous copy is still in scope
	_movementVecs = [new BitVec(STRIDE_MOV),new BitVec(STRIDE_MOV),new BitVec(STRIDE_MOV)];
	_rigidVecs = [new BitVec(STRIDE_MOV),new BitVec(STRIDE_MOV),new BitVec(STRIDE_MOV)];

	_o1 = new BitVec(STRIDE_OBJ);
	_o2 = new BitVec(STRIDE_OBJ);
	_o2_5 = new BitVec(STRIDE_OBJ);
	_o3 = new BitVec(STRIDE_OBJ);
	_o4 = new BitVec(STRIDE_OBJ);
	_o5 = new BitVec(STRIDE_OBJ);
	_o6 = new BitVec(STRIDE_OBJ);
	_o7 = new BitVec(STRIDE_OBJ);
	_o8 = new BitVec(STRIDE_OBJ);
	_o9 = new BitVec(STRIDE_OBJ);
	_o10 = new BitVec(STRIDE_OBJ);
	_o11 = new BitVec(STRIDE_OBJ);
	_o12 = new BitVec(STRIDE_OBJ);
	_m1 = new BitVec(STRIDE_MOV);
	_m2 = new BitVec(STRIDE_MOV);
	_m3 = new BitVec(STRIDE_MOV);
	_m4 = new BitVec(STRIDE_MOV);
	

    for (var i=0;i<curLevel.height;i++) {
      curLevel.rowCellContents[i]=new BitVec(STRIDE_OBJ);        
    }
    for (var i=0;i<curLevel.width;i++) {
      curLevel.colCellContents[i]=new BitVec(STRIDE_OBJ);        
    }

    for (var i=0;i<curLevel.height;i++) {
    	curLevel.rowCellContents_Movements[i]=new BitVec(STRIDE_MOV);	    	
    }
    for (var i=0;i<curLevel.width;i++) {
    	curLevel.colCellContents_Movements[i]=new BitVec(STRIDE_MOV);	    	
    }

    for (var i=0;i<curLevel.n_tiles;i++)
    {
        curLevel.rigidMovementAppliedMask[i]=new BitVec(STRIDE_MOV);
        curLevel.rigidGroupIndexMask[i]=new BitVec(STRIDE_MOV);
    }
}

let messagetext="";			// text for command message
let statusText = "";  		// text for status line
let gosubTarget = -1;  		// name of target gosub
var currentMovedEntities = {};		// entities to be tween animated
var newMovedEntities = {};			// entities that have moved this turn

function applyDiff(diff, level_objects) {

	var index=0;
	
	while (index<diff.dat.length){
		var start_index = diff.dat[index];
		var copy_length = diff.dat[index+1];
		if (copy_length===0){
			break;//tail of buffer is all 0s
		}
		for (var j=0;j<copy_length;j++){
			level_objects[start_index+j]=diff.dat[index+2+j];
		}
		index += 2 + copy_length;
	}
}

function unconsolidateDiff(before,after) {

	// If before is not a diff, return it, otherwise generate a complete 'before' 
	// state from the 'after' state and the 'diff' (remember, the diffs are all 
	// backwards...).
	if (!before.hasOwnProperty("diff")) {
		return before;
	}

	var after_objects = new Int32Array(after.dat);
	applyDiff(before, after_objects);

	return {
		dat: after_objects,
		width: before.width,
		height: before.height,
		mainBoardWidth: before.mainBoardWidth,
		mainBoardHeight: before.mainBoardHeight,
		extraBoardWidth: before.extraBoardWidth,
		extraBoardHeight: before.extraBoardHeight,
		extraCellStates: deepClone(before.extraCellStates || {}),
		oldflickscreendat: before.oldflickscreendat
	}
}

function restoreLevel(lev, snapCamera, resetTween = true, resetAutoTick = true) {
	if (debugSwitch.includes('load')) console.log(`restoreLevel()`, lev, snapCamera, resetTween, resetAutoTick);
	var diffing = lev.hasOwnProperty("diff");

	oldflickscreendat=lev.oldflickscreendat.concat([]);

	if (resetTween) {
		currentMovedEntities = {};
	}

	const switchLevel = lev.levelNo >= 0 && lev.levelNo != curLevelNo;
	if (switchLevel) {
		curLevelNo = lev.levelNo;
		curLevel = state.levels[curLevelNo].clone();
	}

	if (diffing){
		applyDiff(lev, curLevel.objects);
	} else {	
		curLevel.objects = new Int32Array(lev.dat);
	}

	if (switchLevel || curLevel.width !== lev.width || curLevel.height !== lev.height) {
		if (debugSwitch.includes('load')) console.log(`Restore level: from ${curLevel.width}x${curLevel.height} to ${lev.width}x${lev.height}`)
		curLevel.width = lev.width;
		curLevel.height = lev.height;
		curLevel.n_tiles = lev.width * lev.height;
		RebuildLevelArrays();
		//regenerate all other stride-related stuff
	} else {
	// layercount doesn't change

		for (var i=0;i<curLevel.n_tiles;i++) {
			curLevel.movements[i]=0;
			curLevel.rigidMovementAppliedMask[i].setZero();
			curLevel.rigidGroupIndexMask[i].setZero();
		}	

	    for (var i=0;i<curLevel.height;i++) {
	    	var rcc = curLevel.rowCellContents[i];
	    	rcc.setZero();
	    }
	    for (var i=0;i<curLevel.width;i++) {
	    	var ccc = curLevel.colCellContents[i];
	    	ccc.setZero();
	    }
	}

	const currentMainWidth = isFinite(curLevel.mainBoardWidth) ? Math.floor(curLevel.mainBoardWidth) : curLevel.width;
	const currentMainHeight = isFinite(curLevel.mainBoardHeight) ? Math.floor(curLevel.mainBoardHeight) : curLevel.height;
	const loadedMainWidth = isFinite(lev.mainBoardWidth) ? Math.floor(lev.mainBoardWidth) : currentMainWidth;
	const loadedMainHeight = isFinite(lev.mainBoardHeight) ? Math.floor(lev.mainBoardHeight) : currentMainHeight;
	curLevel.mainBoardWidth = Math.max(1, Math.min(curLevel.width, loadedMainWidth));
	curLevel.mainBoardHeight = Math.max(1, Math.min(curLevel.height, loadedMainHeight));

	if (state && state.extraBoardEnabled) {
		const currentExtraWidth = isFinite(curLevel.extraBoardWidth) ? Math.floor(curLevel.extraBoardWidth) : 1;
		const currentExtraHeight = isFinite(curLevel.extraBoardHeight) ? Math.floor(curLevel.extraBoardHeight) : 1;
		const extraWidth = isFinite(lev.extraBoardWidth) ? Math.floor(lev.extraBoardWidth) : currentExtraWidth;
		const extraHeight = isFinite(lev.extraBoardHeight) ? Math.floor(lev.extraBoardHeight) : currentExtraHeight;
		curLevel.extraBoardWidth = Math.max(1, Math.min(curLevel.width, extraWidth));
		curLevel.extraBoardHeight = Math.max(1, Math.min(curLevel.height, extraHeight));
		pruneObjectsOutsideBoardBounds(curLevel);
	}
	curLevel.extraCellStates = deepClone(lev.extraCellStates || {});

    if (lev.cameraPositionTarget) {
      	cameraPositionTarget = Object.assign({}, lev.cameraPositionTarget);

      	if (snapCamera) {
        	cameraPosition = Object.assign({}, cameraPositionTarget)
      	}
    }
    
    if (state.metadata.runtime_metadata_twiddling !== undefined) {
		if (lev.metadata === undefined) {
			lev.metadata = deepClone(state.default_metadata);
			consolePrint("RUNTIME METADATA TWIDDLING: Reloaded level state that did not have saved metadata. "+
			"Likely this state was recovered from a CHECKPOINT. Using the default metadata instead.", true);
		}
	 	state.metadata = deepClone(lev.metadata);
     	twiddleMetadataExtras(resetAutoTick);
    }

	statusText = lev.status || "";

    againing=false;
	messagetext = "";  //fix for hang
    curLevel.commandQueue=[];
    curLevel.commandQueueSourceRules=[];
}

// globals
var zoomscreen=false;
var flickscreen=false;
var smoothscreen=false;
var screenwidth=0;		// size of displayed area in cells
var screenheight=0;

//compresses 'before' into diff
function consolidateDiff(before,after){
	if (before.width !== after.width || before.height!==after.height || before.dat.length!==after.dat.length){
		return before;
	}
	if (before.hasOwnProperty("diff")||after.hasOwnProperty("diff")){
		return before;
	}
	//only generate diffs if level size is bigger than this
	if (before.dat.length<1024){
		return before;
	}
	//diff structure: repeating ( start,length, [ data ] )
	var result = new Int32Array(128);
	var position=0;
	var chain=false;
	var chain_start_idx_in_diff=-1;
	var before_dat = before.dat;
	var after_dat = after.dat;
	for (var i=0;i<before_dat.length;i++){
		if (chain===false){
			if (before_dat[i]!==after_dat[i]){
				chain=true;
				chain_start_idx_in_diff = position;

				if (result.length<position+4){
					var doubled = new Int32Array(2*result.length);
					doubled.set(result);
					result = doubled;
				}

				result[position+0]=i;
				result[position+1]=1;
				result[position+2]=before_dat[i];
				position+=3;
			}
		} else {
			if (before_dat[i]!==after_dat[i]){
				
				if (position+1>=result.length){
					if (result.length<position+4){
						var doubled = new Int32Array(2*result.length);
						doubled.set(result);
						result = doubled;
					}	
				}
				result[chain_start_idx_in_diff+1]++;
				result[position]=before_dat[i];
				position++;
			} else {
				chain=false;
			}
		}
	}
	return {		
		diff : true,
		dat : result,
		width : before.width,
		height : before.height,
		mainBoardWidth: before.mainBoardWidth,
		mainBoardHeight: before.mainBoardHeight,
		extraBoardWidth: before.extraBoardWidth,
		extraBoardHeight: before.extraBoardHeight,
		extraCellStates: deepClone(before.extraCellStates || {}),
		oldflickscreendat: before.oldflickscreendat,
		metadata: before.metadata,
	}
}

function addUndoState(bak){
	if (debugSwitch.includes('undo')) console.log(`addUndoState length=${backups.length} bak=`, bak);
	backups.push(bak);
	if(backups.length>2 && !backups[backups.length-1].hasOwnProperty("diff")){
		backups[backups.length-3]=consolidateDiff(backups[backups.length-3],backups[backups.length-2]);
	}
}

function DoRestart(force) {
	if (restarting===true){
		return;
	}
	if (force!==true && ('norestart' in state.metadata)) {
		return;
	}
	if (againing){
		DoUndo(force,true);
	}
	restarting=true;
	if (force!==true) {
		addUndoState(backupLevel());
	}

	if (verbose_logging) {
		consolePrint("--- restarting ---",true);
	}

	restoreLevel(restartTarget, true);
	initSmoothCamera();
	reset3DCameraIfAvailable();
	tryPlayRestartSound();
	document.dispatchEvent(new CustomEvent("psplusLevelRestarted", {detail: curLevelNo}));

	if ('run_rules_on_level_start' in state.metadata) {
    	processInput(-1,true);
  	}
  
  	twiddleMetadataExtras();
	
	curLevel.commandQueue=[];
	curLevel.commandQueueSourceRules=[];
	restarting=false;
}

function backupDiffers(){
	if (backups.length==0){
		return true;
	}
	var bak = backups[backups.length-1];

	if (bak.hasOwnProperty("diff")){
		return bak.dat.length!==0 && bak.dat[1]!==0;//if it's empty or if it's all 0s
	} else {
		for (var i=0;i<curLevel.objects.length;i++) {
			if (curLevel.objects[i]!==bak.dat[i]) {
				return true;
			}
		}
		return false;
	}
}

function DoUndo(force,ignoreDuplicates, resetTween = true, resetAutoTick = true, forceSFX = false) {
  if ((!levelEditorOpened)&&('noundo' in state.metadata && force!==true)) {
    return;
  }

  if (ignoreDuplicates){
    while (backupDiffers()==false){
      backups.pop();
    }
  }

  if (verbose_logging) {
    consolePrint(backups.length > 0 ? "--- undoing ---" : "Nothing to undo.",true);
  }

  if (backups.length>0) {
    var torestore = backups[backups.length-1];
	if (debugSwitch.includes('undo')) console.log(`DoUndo length=${backups.length} torestore=`, torestore);
    restoreLevel(torestore, null, resetTween, resetAutoTick); 
	updateCameraPositionTarget();
    backups = backups.splice(0,backups.length-1);
	// look for undo across link
	if (linkStack.length > 0 && linkStack.at(-1).backupTop == backups.length)
	  linkStack.pop();
    if (! force || forceSFX) {
      tryPlayUndoSound();
    }
  }
}

// static data used here and elsewhere

// maps between mask values and movement names
var dirMaskName = {
	1: 'up',
	2: 'down',
	3: 'no',
	4: 'left',
	8: 'right',
	15: '?',
	16: 'action',
	18: 'random',
	32: 'lclick',
	64: 'rclick',
	// todo: ??: 'mclick',
	// todo: ??: 'reaction',
};

var dirMasks = {
	'up': 1,
	'down': 2,
	'no': 3,
	'left': 4,
	'randomdir': 5,
	'right': 8,
	'moving': 15,
	'action': 16,
	'random': 18,
	'lclick': 32,
	'rclick': 64,
	// todo: 'mclick': ??,
	// todo: 'reaction': ??,
	'': 0
};

// X and Y increments for each move (in mask form)
var dirMasksDelta = {
	1: [0, -1],
	2: [0, 1],
	3: [0, 0],
	4: [-1, 0],
	8: [1, 0],
	15: [0, 0],
	16: [0, 0],
	18: [0, 0],
	32: [0, 0],
	64: [0, 0]
};

// utility functions
function getObject(objid) {
	return state.objects[state.idDict[objid]];
}

// get movement in layer from movement mask
function getLayerMovement(movmask, layer) {
	return movmask.getshiftor(MOV_MASK, MOV_BITS * layer);
}

// update position index by x and y
function deltaPositionIndex(level, positionIndex, x, y) {
	return positionIndex + y + x * level.height;
}

function getPlayerPositions() {
    var result=[];
    var playerMask = state.playerMask;
    for (var i=0;i<curLevel.n_tiles;i++) {
        curLevel.getCellInto(i,_o11);
        if (playerMask.anyBitsInCommon(_o11)) {
            result.push(i);
        }
    }
    return result;
}

function getLayersOfMask(cellMask) {
    var layers=[];
    for (var i=0;i<state.objectCount;i++) {
        if (cellMask.get(i)) {
            var n = state.idDict[i];
            var o = state.objects[n];
            layers.push(o.layer)
        }
    }
    return layers;
}

function getBoardBoundsForLayer(layer, level = curLevel) {
    if (!level) {
        return { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
    }

    if (!state || !state.extraBoardEnabled) {
        return { xmin: 0, ymin: 0, xmax: level.width, ymax: level.height };
    }

    const split = isFinite(state.extraBaseLayerCount) ? state.extraBaseLayerCount : level.layerCount;
    if (layer >= split) {
        const extraBounds = getExtraBoardBounds(level);
        if (extraBounds) {
            return { xmin: 0, ymin: 0, xmax: extraBounds.width, ymax: extraBounds.height };
        }
    } else {
        const mainBounds = getMainBoardBounds(level);
        if (mainBounds) {
            return { xmin: 0, ymin: 0, xmax: mainBounds.width, ymax: mainBounds.height };
        }
    }

    return { xmin: 0, ymin: 0, xmax: level.width, ymax: level.height };
}

function moveEntitiesAtIndex(positionIndex, entityMask, dirMask) {
    var cellMask = curLevel.getCell(positionIndex);
    cellMask.iand(entityMask);
    var layers = getLayersOfMask(cellMask);

    var movementMask = curLevel.getMovements(positionIndex);
    for (var i=0;i<layers.length;i++) {
      movementMask.ishiftor(dirMask, MOV_BITS * layers[i]);
    }
    curLevel.setMovements(positionIndex, movementMask);

	var colIndex=(positionIndex/curLevel.height)|0;
	var rowIndex=(positionIndex%curLevel.height);
	curLevel.colCellContents_Movements[colIndex].ior(movementMask);
	curLevel.rowCellContents_Movements[rowIndex].ior(movementMask);
	curLevel.mapCellContents_Movements.ior(movementMask);
}


function startMovement(dir) {
  var movedany=false;
    var playerPositions = getPlayerPositions();
    for (var i=0;i<playerPositions.length;i++) {
        var playerPosIndex = playerPositions[i];
        moveEntitiesAtIndex(playerPosIndex,state.playerMask,dir);
    }
    return playerPositions;
}

var seedsToPlay_CanMove=[];
var seedsToPlay_CantMove=[];
var seedsToAnimate={};  // doc: "positition,layer": { kind:, seed:, dir: }

function repositionEntitiesOnLayer(positionIndex,layer,dirMask) 
{
    var delta = dirMasksDelta[dirMask];

    var dx = delta[0];
    var dy = delta[1];
    var tx = ((positionIndex/curLevel.height)|0);
    var ty = ((positionIndex%curLevel.height));
    const bounds = getBoardBoundsForLayer(layer, curLevel);
    const minx = bounds.xmin;
    const miny = bounds.ymin;
    const maxx = bounds.xmax - 1;
    const maxy = bounds.ymax - 1;

    if (tx < minx || tx > maxx || ty < miny || ty > maxy) {
      return false;
    }

    if ( (tx===minx&&dx<0) || (tx===maxx&&dx>0) || (ty===miny&&dy<0) || (ty===maxy&&dy>0)) {
      return false;
    }

    var targetIndex = (positionIndex+delta[1]+delta[0]*curLevel.height);

    var layerMask = state.layerMasks[layer];
    var targetMask = curLevel.getCellInto(targetIndex,_o7);
	var sourceMask = curLevel.getCellInto(positionIndex,_o8);

    if (layerMask.anyBitsInCommon(targetMask) && (dirMask < 16)) {		// tofix: 16
        return false;
    }

	// for each sound movement event, which applies to a single object and layer
	for (let i=0;i<state.sfx_MovementMasks[layer].length;i++) {
		const fx = state.sfx_MovementMasks[layer][i];
		if (sourceMask.get(fx.objId)) {
      		var movementMask = curLevel.getMovements(positionIndex);
      		var directionMask = fx.directionMask;
			// does it match any movement at this location?
      		if (movementMask.anyBitsInCommon(directionMask)) {  // bug: two objects at location can cause false trigger
    			if (verbose_logging) 
					consolePrint(`Object "${state.idDict[fx.objId]}" has moved, playing seed "${fx.seed}".`)
				if (fx.seed.startsWith('afx')) {
					const object = getObject(fx.objId);
					const move = getLayerMovement(movementMask, object.layer);
					const position = deltaPositionIndex(curLevel, positionIndex, dirMasksDelta[move][0], dirMasksDelta[move][1])
					seedsToAnimate[position+','+fx.objId] = { 
						kind: 'move', 
						seed: fx.seed, 
						dir: move 
					};
				}
				else if (seedsToPlay_CanMove.indexOf(fx.seed)===-1)
					seedsToPlay_CanMove.push(fx.seed);
      		}
    	}
  	}

    var movingEntities = sourceMask.clone();
    sourceMask.iclear(layerMask);
    movingEntities.iand(layerMask);
    targetMask.ior(movingEntities);

    curLevel.setCell(positionIndex, sourceMask);
	curLevel.setCell(targetIndex, targetMask);
	
    var colIndex=(targetIndex/curLevel.height)|0;
	var rowIndex=(targetIndex%curLevel.height);
	
    curLevel.colCellContents[colIndex].ior(movingEntities);
    curLevel.rowCellContents[rowIndex].ior(movingEntities);
	//corresponding movement stuff in setmovements
    return true;
}

function repositionEntitiesAtCell(positionIndex, dontModify) {
		var movementMask = curLevel.getMovements(positionIndex);
    if (movementMask.iszero())
        return false;

    var moved=false;
    for (var layer=0;layer<curLevel.layerCount;layer++) {
        var layerMovement = movementMask.getshiftor(MOV_MASK, MOV_BITS * layer);
        if (layerMovement!==0) {
            var thismoved = repositionEntitiesOnLayer(positionIndex,layer,layerMovement);
            if (thismoved) {
				if (state.metadata.tween_length && !dontModify) {
					var delta = dirMasksDelta[layerMovement];
					var targetIndex = (positionIndex+delta[1]+delta[0]*curLevel.height);

					newMovedEntities["p"+targetIndex+"-l"+layer] = layerMovement;
				}

                movementMask.ishiftclear(layerMovement, MOV_BITS * layer);
				moved = true;
            }
        }
    }

    curLevel.setMovements(positionIndex, movementMask);

    return moved;
}


function Level(lineNumber, width, height, layerCount, objects, section) {
	this.lineNumber = lineNumber;
	this.width = width;
	this.height = height;
	this.n_tiles = width * height;
	this.objects = objects;
	this.section = section;
	this.layerCount = layerCount;
	this.commandQueue = [];
	this.commandQueueSourceRules = [];
	this.mainBoardWidth = width;
	this.mainBoardHeight = height;
	this.extraBoardWidth = 1;
	this.extraBoardHeight = 1;
	this.extraCellStates = {};
}

Level.prototype.delta_index = function(direction)
{
	const [dx, dy] = dirMasksDelta[direction]
	return dx*this.height + dy
}

Level.prototype.clone = function() {
	var clone = new Level(this.lineNumber, this.width, this.height, this.layerCount, null, this.section);
	clone.objects = new Int32Array(this.objects);
	clone.mainBoardWidth = this.mainBoardWidth;
	clone.mainBoardHeight = this.mainBoardHeight;
	clone.extraBoardWidth = this.extraBoardWidth;
	clone.extraBoardHeight = this.extraBoardHeight;
	clone.extraCellStates = deepClone(this.extraCellStates || {});
	return clone;
}

Level.prototype.getCell = function(index) {
  return new BitVec(this.objects.subarray(index * STRIDE_OBJ, index * STRIDE_OBJ + STRIDE_OBJ));
}

Level.prototype.getCellInto = function(index,targetarray) {
  for (var i=0;i<STRIDE_OBJ;i++) {
    targetarray.data[i]=this.objects[index*STRIDE_OBJ+i]; 
  }
  return targetarray;
}

Level.prototype.setCell = function(index, vec) {
  for (var i = 0; i < vec.data.length; ++i) {
    this.objects[index * STRIDE_OBJ + i] = vec.data[i];
  }
}

var _movementVecs;
var _movementVecIndex=0;
Level.prototype.getMovements = function(index) {
  var _movementsVec=_movementVecs[_movementVecIndex];
  _movementVecIndex=(_movementVecIndex+1)%_movementVecs.length;

  for (var i=0;i<STRIDE_MOV;i++) {
		_movementsVec.data[i]= this.movements[index*STRIDE_MOV+i];	
  }
  return _movementsVec;
}

Level.prototype.getRigids = function(index) {
	return this.rigidMovementAppliedMask[index].clone();
}

Level.prototype.getMovementsInto = function(index,targetarray) {
	var _movementsVec=targetarray;

	for (var i=0;i<STRIDE_MOV;i++) {
		_movementsVec.data[i]=this.movements[index*STRIDE_MOV+i];	
	}
	return _movementsVec;
}

Level.prototype.setMovements = function(index, vec) {
	for (var i = 0; i < vec.data.length; ++i) {
		this.movements[index * STRIDE_MOV + i] = vec.data[i];
	}

	var targetIndex = index*STRIDE_MOV + i;
		
	//corresponding object stuff in repositionEntitiesOnLayer
	var colIndex=(index/this.height)|0;
	var rowIndex=(index%this.height);
	curLevel.colCellContents_Movements[colIndex].ior(vec);
	curLevel.rowCellContents_Movements[rowIndex].ior(vec);
	curLevel.mapCellContents_Movements.ior(vec);


}

// return a list of object names at index
Level.prototype.getObjects = function(index) {
	const bitmask = this.getCell(index);
	const objs = [];
	for (let bit = 0; bit < 32 * STRIDE_OBJ; ++bit) {
		if (bitmask.get(bit)) {
			objs.push(state.idDict[bit])
		}
	}
	return objs;
}

var ellipsisPattern = ['ellipsis'];

function BitVec(init) {
	this.data = new Int32Array(init);
	return this;
}

BitVec.prototype.format = function() {
	return '[' + [...this.data].map(d => `${d.toString(16)}h`).join(',') + ']';
}

BitVec.prototype.cloneInto = function(target) {
  for (var i=0;i<this.data.length;++i) {
    target.data[i]=this.data[i];
  }
  return target;
}
BitVec.prototype.clone = function() {
  return new BitVec(this.data);
}

BitVec.prototype.iand = function(other) {
  for (var i = 0; i < this.data.length; ++i) {
    this.data[i] &= other.data[i];
  }
}


BitVec.prototype.inot = function() {
	for (var i = 0; i < this.data.length; ++i) {
		this.data[i] = ~this.data[i];
	}
}

BitVec.prototype.ior = function(other) {
  for (var i = 0; i < this.data.length; ++i) {
    this.data[i] |= other.data[i];
  }
}

BitVec.prototype.iclear = function(other) {
  for (var i = 0; i < this.data.length; ++i) {
    this.data[i] &= ~other.data[i];
  }
}

BitVec.prototype.ibitset = function(ind) {
  this.data[ind>>5] |= 1 << (ind & 31);
}

BitVec.prototype.ibitclear = function(ind) {
  this.data[ind>>5] &= ~(1 << (ind & 31));
}

BitVec.prototype.get = function(ind) {
  return (this.data[ind>>5] & 1 << (ind & 31)) !== 0;
}

BitVec.prototype.getshiftor = function(mask, shift) {
  var toshift = shift & 31;
  var ret = this.data[shift>>5] >>> (toshift);
  if (toshift) {
    ret |= this.data[(shift>>5)+1] << (32 - toshift);
  }
  return ret & mask;
}

BitVec.prototype.ishiftor = function(mask, shift) {
  var toshift = shift&31;
  var low = mask << toshift;
  this.data[shift>>5] |= low;
  if (toshift) {
    var high = mask >> (32 - toshift);
    this.data[(shift>>5)+1] |= high;
  }
}

BitVec.prototype.ishiftclear = function(mask, shift) {
  var toshift = shift & 31;
  var low = mask << toshift;
  this.data[shift>>5] &= ~low;
  if (toshift){
    var high = mask >> (32 - (shift & 31));
    this.data[(shift>>5)+1] &= ~high;
  }
}

BitVec.prototype.equals = function(other) {
  if (this.data.length !== other.data.length)
    return false;
  for (var i = 0; i < this.data.length; ++i) {
    if (this.data[i] !== other.data[i])
      return false;
  }
  return true;
}

BitVec.prototype.setZero = function() {
  for (var i = 0; i < this.data.length; ++i) {
    this.data[i]=0;
  }
}

BitVec.prototype.iszero = function() {
  for (var i = 0; i < this.data.length; ++i) {
    if (this.data[i])
      return false;
  }
  return true;
}

BitVec.prototype.bitsSetInArray = function(arr) {
  for (var i = 0; i < this.data.length; ++i) {
    if ((this.data[i] & arr[i]) !== this.data[i]) {
      return false;
    }
  }
  return true;
}

BitVec.prototype.bitsClearInArray = function(arr) {
  for (var i = 0; i < this.data.length; ++i) {
    if (this.data[i] & arr[i]) {
      return false;
    }
  }
  return true;
}

BitVec.prototype.anyBitsInCommon = function(other) {
  return !this.bitsClearInArray(other.data);
}

function Rule(rule) {
	this.direction = rule[0]; 		/* direction rule scans in */
	this.patterns = rule[1];		/* lists of CellPatterns to match */
	this.hasReplacements = rule[2];
	this.lineNumber = rule[3];		/* rule source for debugging */
	this.ellipsisCount = rule[4];		/* number of ellipses present */
	this.groupNumber = rule[5];		/* execution group number of rule */
	this.isRigid = rule[6];
	this.commands = rule[7];		/* cancel, restart, sfx, etc */
	this.isRandom = rule[8];
	this.cellRowMasks = rule[9];
    this.cellRowMasks_Movements = rule[10];
    this.isGlobal = rule[11];
    this.isOnce = rule[12];
	this.boardScope = rule[13] || 0; // 0=all, 1=main board, 2=extra board
	this.ruleMask = this.cellRowMasks.reduce( (acc, m) => { acc.ior(m); return acc }, new BitVec(STRIDE_OBJ) );

	/*I tried out doing a ruleMask_movements as well along the lines of the above,
	but it didn't help at all - I guess because almost every tick there are movements 
	somewhere on the board - move filtering works well at a row/col level, but is pretty 
	useless (or worse than useless) on a boardwide level*/

	this.cellRowMatches = [];
	for (var i=0;i<this.patterns.length;i++) {
		this.cellRowMatches.push(this.generateCellRowMatchesFunction(this.patterns[i],this.ellipsisCount[i]));
	}
	/* TODO: eliminate isRigid, groupNumber, isRandom
	from this class by moving them up into a RuleGroup class */
}


Rule.prototype.generateCellRowMatchesFunction = function(cellRow,ellipsisCount)  {
	if (ellipsisCount===0) {
		var cr_l = cellRow.length;

		/*
		hard substitute in the first one - if I substitute in all of them, firefox chokes.
		*/
		var fn = "";
		var mul = STRIDE_OBJ === 1 ? '' : '*'+STRIDE_OBJ;	
		for (var i = 0; i < STRIDE_OBJ; ++i) {
			fn += 'var cellObjects' + i + ' = objects[i' + mul + (i ? '+'+i: '') + '];\n';
		}
		mul = STRIDE_MOV === 1 ? '' : '*'+STRIDE_MOV;
		for (var i = 0; i < STRIDE_MOV; ++i) {
			fn += 'var cellMovements' + i + ' = movements[i' + mul + (i ? '+'+i: '') + '];\n';
		}
		fn += "return "+cellRow[0].generateMatchString('0_');// cellRow[0].matches(i)";
		for (var cellIndex=1;cellIndex<cr_l;cellIndex++) {
			fn+="&&cellRow["+cellIndex+"].matches(i+"+cellIndex+"*d, objects, movements)";
		}
		fn+=";";

		if (fn in matchCache) {
			return matchCache[fn];
		}
		return matchCache[fn] = new Function("cellRow","i", 'd', 'objects', 'movements',fn);
	} else if (ellipsisCount===1){
		var cr_l = cellRow.length;

		var fn = "var result = [];\n"
		fn += "if(cellRow[0].matches(i, objects, movements)";
		var cellIndex=1;
		// fix for prior error leaves no ellipsis
		for ( ; cellRow[cellIndex] !== ellipsisPattern && cellIndex < cr_l; cellIndex++) {
			fn+="&&cellRow["+cellIndex+"].matches(i+"+cellIndex+"*d, objects, movements)";
		}
		cellIndex++;
		fn+=") {\n";
		fn+="\tfor (var k=kmin;k<kmax;k++) {\n"
		fn+="\t\tif(cellRow["+cellIndex+"].matches((i+d*(k+"+(cellIndex-1)+")), objects, movements)";
		cellIndex++;
		for (;cellIndex<cr_l;cellIndex++) {
			fn+="&&cellRow["+cellIndex+"].matches((i+d*(k+"+(cellIndex-1)+")), objects, movements)";			
		}
		fn+="){\n";
		fn+="\t\t\tresult.push([i,k]);\n";
		fn+="\t\t}\n"
		fn+="\t}\n";				
		fn+="}\n";		
		fn+="return result;"


		if (fn in matchCache) {
			return matchCache[fn];
		}
		//console.log(fn.replace(/\s+/g, ' '));
		return matchCache[fn] = new Function("cellRow","i","kmax","kmin", 'd', "objects", "movements",fn);
	} else { //ellipsisCount===2
		var cr_l = cellRow.length;

		var ellipsis_index_1=-1;
		var ellipsis_index_2=-1;
		for (var cellIndex=0;cellIndex<cr_l;cellIndex++) {
			if (cellRow[cellIndex]===ellipsisPattern) {
				if (ellipsis_index_1===-1) {
					ellipsis_index_1=cellIndex;
				} else {
					ellipsis_index_2=cellIndex;
					break;
				}
			}
		}

		var fn = "var result = [];\n"
		fn += "if(cellRow[0].matches(i, objects, movements)";

		for (var idx=1;idx<ellipsis_index_1;idx++) {
			fn+="&&cellRow["+idx+"].matches(i+"+idx+"*d, objects, movements)";
		}
		fn+=") {\n";

		//try match middle part
		fn+="	for (var k1=k1min;k1<k1max;k1++) {\n"
		fn+="		if(cellRow["+(ellipsis_index_1+1)+"].matches((i+d*(k1+"+(ellipsis_index_1+1-1)+")), objects, movements)";
		for (var idx=ellipsis_index_1+2;idx<ellipsis_index_2;idx++) {
			fn+="&&cellRow["+idx+"].matches((i+d*(k1+"+(idx-1)+")), objects, movements)";			
		}
		fn+="		){\n";
		//try match right part

		fn+="			for (var k2=k2min;k1+k2<kmax && k2<k2max;k2++) {\n"
		fn+="				if(cellRow["+(ellipsis_index_2+1)+"].matches((i+d*(k1+k2+"+(ellipsis_index_2+1-2)+")), objects, movements)";
		for (var idx=ellipsis_index_2+2;idx<cr_l;idx++) {
			fn+="&&cellRow["+idx+"].matches((i+d*(k1+k2+"+(idx-2)+")), objects, movements)";			
		}
		fn+="				){\n";
		fn+="					result.push([i,k1,k2]);\n";
		fn+="				}\n"
		fn+="			}\n"
		fn+="		}\n"
		fn+="	}\n";				
		fn+="}\n";		
		fn+="return result;"


		if (fn in matchCache) {
			return matchCache[fn];
		}
		//console.log(fn.replace(/\s+/g, ' '));
		return matchCache[fn] = new Function("cellRow","i","kmax","kmin", "k1max","k1min","k2max","k2min", 'd', "objects", "movements",fn);

	}
//say cellRow has length 3, with a split in the middle
/*
function cellRowMatchesWildcardFunctionGenerate(direction,cellRow,i, maxk, mink) {
  var result = [];
  var matchfirsthalf = cellRow[0].matches(i);
  if (matchfirsthalf) {
    for (var k=mink;k<maxk;k++) {
      if (cellRow[2].matches((i+d*(k+0)))) {
        result.push([i,k]);
      }
    }
  }
  return result;
}
*/
  

}

//@@ should these go in globals? Might fix one notified problem (no repro)
let MOV_BITS = 5;		// doc: no of bits to hold movement as mask
let MOV_MASK = 0x1f;	// doc: bit mask to match
var STRIDE_OBJ = 1;	    // doc: size of BitVec to hold objects, at 32 bits per
var STRIDE_MOV = 1;		// doc: size of BitVec to hold movements, at MOV_BITS bits per

function CellPattern(row) {
  this.objectsPresent = row[0];
  this.objectsMissing = row[1];
  this.anyObjectsPresent = row[2];
  this.movementsPresent = row[3];
  this.movementsMissing = row[4];
  this.matches = this.generateMatchFunction();
  this.replacement = row[5];
};

function CellReplacement(row) {
  this.objectsClear = row[0];
  this.objectsSet = row[1];
  this.movementsClear = row[2];
  this.movementsSet = row[3];
  this.movementsLayerMask = row[4];
  this.randomEntityMask = row[5];
  this.randomDirMask = row[6];
};


var matchCache = {};



CellPattern.prototype.generateMatchString = function() {
  var fn = "(true";
  for (var i = 0; i < Math.max(STRIDE_OBJ, STRIDE_MOV); ++i) {
    var co = 'cellObjects' + i;
    var cm = 'cellMovements' + i;
    var op = this.objectsPresent.data[i];
    var om = this.objectsMissing.data[i];
    var mp = this.movementsPresent.data[i];
    var mm = this.movementsMissing.data[i];
    if (op) {
      if (op&(op-1))
        fn += '\t\t&& ((' + co + '&' + op + ')===' + op + ')\n';
      else
        fn += '\t\t&& (' + co + '&' + op + ')\n';
    }
    if (om)
      fn += '\t\t&& !(' + co + '&' + om + ')\n';
    if (mp) {
      if (mp&(mp-1))
        fn += '\t\t&& ((' + cm + '&' + mp + ')===' + mp + ')\n';
      else
        fn += '\t\t&& (' + cm + '&' + mp + ')\n';
    }
    if (mm)
      fn += '\t\t&& !(' + cm + '&' + mm + ')\n';
  }
  for (var j = 0; j < this.anyObjectsPresent.length; j++) {
    fn += "\t\t&& (0";
    for (var i = 0; i < STRIDE_OBJ; ++i) {
      var aop = this.anyObjectsPresent[j].data[i];
      if (aop)
        fn += "|(cellObjects" + i + "&" + aop + ")";
    }
    fn += ")";
  }
  fn += '\t)';
  return fn;
}

CellPattern.prototype.generateMatchFunction = function() {
	var i;
	var fn = '';
	var mul = STRIDE_OBJ === 1 ? '' : '*'+STRIDE_OBJ;	
	for (var i = 0; i < STRIDE_OBJ; ++i) {
		fn += '\tvar cellObjects' + i + ' = objects[i' + mul + (i ? '+'+i: '') + '];\n';
	}
	mul = STRIDE_MOV === 1 ? '' : '*'+STRIDE_MOV;
	for (var i = 0; i < STRIDE_MOV; ++i) {
		fn += '\tvar cellMovements' + i + ' = movements[i' + mul + (i ? '+'+i: '') + '];\n';
	}
	fn += "return " + this.generateMatchString()+';';
	if (fn in matchCache) {
		return matchCache[fn];
	}
	//console.log(fn.replace(/\s+/g, ' '));
	return matchCache[fn] = new Function("i", "objects", "movements", fn);
}

var _o1,_o2,_o2_5,_o3,_o4,_o5,_o6,_o7,_o8,_o9,_o10,_o11,_o12;
var _m1,_m2,_m3,_m4;

CellPattern.prototype.replace = function(rule, currentIndex) {
  var replace = this.replacement;

  if (replace === null) {
    return false;
  }

  var replace_RandomEntityMask = replace.randomEntityMask;
  var replace_RandomDirMask = replace.randomDirMask;

  var objectsSet = replace.objectsSet.cloneInto(_o1);
  var objectsClear = replace.objectsClear.cloneInto(_o2);

  var movementsSet = replace.movementsSet.cloneInto(_m1);
  var movementsClear = replace.movementsClear.cloneInto(_m2);
  var scopedMovementsLayerMask = replace.movementsLayerMask.cloneInto(_m4);
  movementsClear.ior(scopedMovementsLayerMask);

  if (!replace_RandomEntityMask.iszero()) {
    var choices=[];
    for (var i=0;i<32*STRIDE_OBJ;i++) {
      if (replace_RandomEntityMask.get(i)) {
        choices.push(i);
      }
    }
    var rand = choices[Math.floor(RandomGen.uniform() * choices.length)];
    var n = state.idDict[rand];
    var o = state.objects[n];
    objectsSet.ibitset(rand);
    objectsClear.ior(state.layerMasks[o.layer]);
    movementsClear.ishiftor(MOV_MASK, MOV_BITS * o.layer);
  }
  if (!replace_RandomDirMask.iszero()) {
    for (var layerIndex=0;layerIndex<curLevel.layerCount;layerIndex++){
      if (replace_RandomDirMask.get(MOV_BITS * layerIndex)) {
        var randomDir = Math.floor(RandomGen.uniform()*4);
        movementsSet.ibitset(randomDir + MOV_BITS * layerIndex);
      }
    }
  }
  
  var curCellMask = curLevel.getCellInto(currentIndex,_o2_5);
  var curMovementMask = curLevel.getMovements(currentIndex);

  var oldCellMask = curCellMask.cloneInto(_o3);
  var oldMovementMask = curMovementMask.cloneInto(_m3);

  curCellMask.iclear(objectsClear);
  curCellMask.ior(objectsSet);

  curMovementMask.iclear(movementsClear);
  curMovementMask.ior(movementsSet);

  if ((rule.boardScope === 1 || rule.boardScope === 2) && state && state.extraBoardEnabled) {
    const scopedBounds = getRuleScopedBounds(rule.boardScope, curLevel);
    const x = ((currentIndex / curLevel.height) | 0);
    const y = (currentIndex % curLevel.height);
    for (let layer = 0; layer < curLevel.layerCount; layer++) {
      const layerShift = MOV_BITS * layer;
      const requestedMovement = movementsSet.getshiftor(MOV_MASK, layerShift);
      if (requestedMovement === 0) {
        continue;
      }
      const movement = curMovementMask.getshiftor(MOV_MASK, layerShift);
      const delta = dirMasksDelta[movement];
      if (!delta) {
        continue;
      }

      const tx = x + delta[0];
      const ty = y + delta[1];
      if (tx < scopedBounds.xmin || tx >= scopedBounds.xmax || ty < scopedBounds.ymin || ty >= scopedBounds.ymax) {
        curMovementMask.ishiftclear(movement, layerShift);
        scopedMovementsLayerMask.ishiftclear(MOV_MASK, layerShift);
      }
    }
  }

  var rigidchange=false;
  var curRigidGroupIndexMask =0;
  var curRigidMovementAppliedMask =0;
  if (rule.isRigid) {
    var rigidGroupIndex = state.groupNumber_to_RigidGroupIndex[rule.groupNumber];
    rigidGroupIndex++;//don't forget to -- it when decoding :O
    var rigidMask = new BitVec(STRIDE_MOV);
    for (var layer = 0; layer < curLevel.layerCount; layer++) {
      rigidMask.ishiftor(rigidGroupIndex, MOV_BITS * layer);
    }
    rigidMask.iand(scopedMovementsLayerMask);
    curRigidGroupIndexMask = curLevel.rigidGroupIndexMask[currentIndex] || new BitVec(STRIDE_MOV);
    curRigidMovementAppliedMask = curLevel.rigidMovementAppliedMask[currentIndex] || new BitVec(STRIDE_MOV);

    if (!rigidMask.bitsSetInArray(curRigidGroupIndexMask.data) &&
      !scopedMovementsLayerMask.bitsSetInArray(curRigidMovementAppliedMask.data) ) {
      curRigidGroupIndexMask.ior(rigidMask);
      curRigidMovementAppliedMask.ior(scopedMovementsLayerMask);
      rigidchange=true;

    }
  }

  var result = false;

  //check if it's changed
  if (!oldCellMask.equals(curCellMask) || !oldMovementMask.equals(curMovementMask) || rigidchange) { 
		result=true;
		if (rigidchange) {
			curLevel.rigidGroupIndexMask[currentIndex] = curRigidGroupIndexMask;
			curLevel.rigidMovementAppliedMask[currentIndex] = curRigidMovementAppliedMask;
		}

		// were any objects create or destroyed? Add to list for sfx checking
		// - as mask, one bit per object
		// - as list, one entry per object, with position

		var created = curCellMask.cloneInto(_o4);
		created.iclear(oldCellMask);
		sfxCreateMask.ior(created);
		for (let objId = 0; objId < state.objectCount; ++objId) {
			if (created.get(objId))
				sfxCreateList.push({ 
					posIndex: currentIndex, objId: objId
				});
		}

		var destroyed = oldCellMask.cloneInto(_o5);
		destroyed.iclear(curCellMask);
		sfxDestroyMask.ior(destroyed);
		for (let objId = 0; objId < state.objectCount; ++objId) {
			if (destroyed.get(objId))
				sfxDestroyList.push({ 
					posIndex: currentIndex, objId: objId
				});
		}

		curLevel.setCell(currentIndex, curCellMask);
		curLevel.setMovements(currentIndex, curMovementMask);

		var colIndex=(currentIndex/curLevel.height)|0;
		var rowIndex=(currentIndex%curLevel.height);
		curLevel.colCellContents[colIndex].ior(curCellMask);
		curLevel.rowCellContents[rowIndex].ior(curCellMask);
		curLevel.mapCellContents.ior(curCellMask);

	}

  	return result;
}



function getRuleScopedBounds(boardScope, level = curLevel) {
	if (!level) {
		return { xmin: 0, xmax: 0, ymin: 0, ymax: 0 };
	}

	let xmin = 0;
	let xmax = level.width;
	let ymin = 0;
	let ymax = level.height;

	if (state && state.extraBoardEnabled) {
		if (boardScope === 1) {
			const mainBounds = getMainBoardBounds(level);
			if (mainBounds) {
				xmax = mainBounds.width;
				ymax = mainBounds.height;
			}
		} else if (boardScope === 2) {
			const extraBounds = getExtraBoardBounds(level);
			if (extraBounds) {
				xmax = extraBounds.width;
				ymax = extraBounds.height;
			}
		}
	}

	return { xmin, xmax, ymin, ymax };
}

function matchCellRow(direction, cellRowMatch, cellRow, cellRowMask,cellRowMask_Movements,d, isGlobal, boardScope = 0) {
	var result=[];

	if ((!cellRowMask.bitsSetInArray(curLevel.mapCellContents.data))||
	(!cellRowMask_Movements.bitsSetInArray(curLevel.mapCellContents_Movements.data))) {
		return result;
	}

	const scoped = getRuleScopedBounds(boardScope, curLevel);
	let xmin = scoped.xmin;
	let xmax = scoped.xmax;
	let ymin = scoped.ymin;
	let ymax = scoped.ymax;

	if (!(isGlobal || state.metadata.local_radius === undefined)) {
		var localradius = parseInt(state.metadata.local_radius);
		const lxmin = Math.max(0, (playerPositions[0]/curLevel.height|0) - localradius);
		const lxmax = Math.min(curLevel.width, (playerPositions[0]/curLevel.height|0) + localradius +1);
		const lymin = Math.max(0, playerPositions[0]%curLevel.height - localradius);
		const lymax = Math.min(curLevel.height, playerPositions[0]%curLevel.height + localradius+1);
		xmin = Math.max(xmin, lxmin);
		xmax = Math.min(xmax, lxmax);
		ymin = Math.max(ymin, lymin);
		ymax = Math.min(ymax, lymax);
	}

    var len=cellRow.length;

    switch(direction) {
      case 1://up
      {
        ymin+=(len-1);
        break;
      }
      case 2: //down
      {
      ymax-=(len-1);
      break;
      }
      case 4: //left
      {
        xmin+=(len-1);
        break;
      }
      case 8: //right
    {
      xmax-=(len-1);
      break;
    }
      default:
      {
        window.console.log("EEEP "+direction);
      }
    }

    var horizontal=direction>2;
    if (horizontal) {
		for (var y=ymin;y<ymax;y++) {
			if (!cellRowMask.bitsSetInArray(curLevel.rowCellContents[y].data)
			|| !cellRowMask_Movements.bitsSetInArray(curLevel.rowCellContents_Movements[y].data)) {
				continue;
			}

			for (var x=xmin;x<xmax;x++) {
				var i = x*curLevel.height+y;
				if (cellRowMatch(cellRow,i,d, curLevel.objects, curLevel.movements))
				{
					result.push(i);
				}
			}
		}
	} else {
		for (var x=xmin;x<xmax;x++) {
			if (!cellRowMask.bitsSetInArray(curLevel.colCellContents[x].data)
			|| !cellRowMask_Movements.bitsSetInArray(curLevel.colCellContents_Movements[x].data)) {
				continue;
			}

			for (var y=ymin;y<ymax;y++) {
				var i = x*curLevel.height+y;
				if (cellRowMatch(cellRow,i, d, curLevel.objects, curLevel.movements)) {
					result.push(i);
				}
			}
		}
	}

  return result;
}


function matchCellRowWildCard(direction, cellRowMatch, cellRow,cellRowMask,cellRowMask_Movements,d,wildcardCount, boardScope = 0) {
	var result=[];
	if ((!cellRowMask.bitsSetInArray(curLevel.mapCellContents.data))
	|| (!cellRowMask_Movements.bitsSetInArray(curLevel.mapCellContents_Movements.data))) {
		return result;
	}

	const scoped = getRuleScopedBounds(boardScope, curLevel);
	const xminBound = scoped.xmin;
	const xmaxBound = scoped.xmax;
	const yminBound = scoped.ymin;
	const ymaxBound = scoped.ymax;
	var xmin=xminBound;
	var xmax=xmaxBound;
	var ymin=yminBound;
	var ymax=ymaxBound;

	var len=cellRow.length-wildcardCount;//remove one to deal with wildcard
    switch(direction) {
      case 1://up
      {
        ymin+=(len-1);
        break;
      }
      case 2: //down
      {
      ymax-=(len-1);
      break;
      }
      case 4: //left
      {
        xmin+=(len-1);
        break;
      }
      case 8: //right
    {
      xmax-=(len-1);
      break;
    }
      default:
      {
        window.console.log("EEEP2 "+direction);
      }
    }



    var horizontal=direction>2;
    if (horizontal) {
		for (var y=ymin;y<ymax;y++) {
			if (!cellRowMask.bitsSetInArray(curLevel.rowCellContents[y].data)
			|| !cellRowMask_Movements.bitsSetInArray(curLevel.rowCellContents_Movements[y].data) ) {
				continue;
			}

			for (var x=xmin;x<xmax;x++) {
				var i = x*curLevel.height+y;
				var kmax;

				if (direction === 4) { //left
					kmax=x-xminBound-len+2;
				} else if (direction === 8) { //right
					kmax=xmaxBound-(x+len)+1;
				} else {
					window.console.log("EEEP2 "+direction);
				}

				if (wildcardCount===1) {
				result.push.apply(result, cellRowMatch(cellRow,i,kmax,0, d, curLevel.objects, curLevel.movements));
				} else {
					result.push.apply(result, cellRowMatch(cellRow,i,kmax,0,kmax,0,kmax,0, d, curLevel.objects, curLevel.movements));
			}
		}
		}
	} else {
		for (var x=xmin;x<xmax;x++) {
			if (!cellRowMask.bitsSetInArray(curLevel.colCellContents[x].data)
			|| !cellRowMask_Movements.bitsSetInArray(curLevel.colCellContents_Movements[x].data)) {
				continue;
			}

			for (var y=ymin;y<ymax;y++) {
				var i = x*curLevel.height+y;
				var kmax;


        if (direction === 2) { // down
          kmax=ymaxBound-(y+len)+1;
        } else if (direction === 1) { // up
          kmax=y-yminBound-len+2;
        } else {
          window.console.log("EEEP2 "+direction);
        }
				if (wildcardCount===1) {
					result.push.apply(result, cellRowMatch(cellRow,i,kmax,0, d, curLevel.objects, curLevel.movements));
				} else {
					result.push.apply(result, cellRowMatch(cellRow,i,kmax,0, kmax,0, kmax,0, d, curLevel.objects, curLevel.movements));
				}
			}
    }
  }

  return result;
}

function generateTuples(lists) {
    var tuples=[[]];

    for (var i=0;i<lists.length;i++)
    {
        var row = lists[i];
        var newtuples=[];
        for (var j=0;j<row.length;j++) {
            var valtoappend = row[j];
            for (var k=0;k<tuples.length;k++) {
                var tuple=tuples[k];
                var newtuple = tuple.concat([valtoappend]);
                newtuples.push(newtuple);
            }
        }
        tuples=newtuples;
    }
    return tuples;
}


Rule.prototype.findMatches = function() {	
	if ( ! this.ruleMask.bitsSetInArray(curLevel.mapCellContents.data) )
		return [];

	const d = curLevel.delta_index(this.direction)

	if (debugSwitch.includes('masks')) console.log(`Findmatches d=${d} dir=${this.direction} levobj=${curLevel.objects} levmov=${curLevel.movements}`);
	var matches=[];
	var cellRowMasks=this.cellRowMasks;
	var cellRowMasks_Movements=this.cellRowMasks_Movements;
    for (var cellRowIndex=0;cellRowIndex<this.patterns.length;cellRowIndex++) {
        var cellRow = this.patterns[cellRowIndex];
        var matchFunction = this.cellRowMatches[cellRowIndex];
        if (this.ellipsisCount[cellRowIndex]===1) {//if ellipsis     
        	var match = matchCellRowWildCard(this.direction,matchFunction,cellRow,cellRowMasks[cellRowIndex],cellRowMasks_Movements[cellRowIndex],d,this.ellipsisCount[cellRowIndex], this.boardScope);
        } else  if (this.ellipsisCount[cellRowIndex]===0) {
        	var match = matchCellRow(this.direction,matchFunction,cellRow,cellRowMasks[cellRowIndex],cellRowMasks_Movements[cellRowIndex],d, this.isGlobal, this.boardScope);
        } else { // ellipsiscount===2
        	var match = matchCellRowWildCard(this.direction,matchFunction,cellRow,cellRowMasks[cellRowIndex],cellRowMasks_Movements[cellRowIndex],d,this.ellipsisCount[cellRowIndex], this.boardScope);
        }
		if (debugSwitch.includes('masks')) {
			const cro = cellRowMasks[cellRowIndex].format();
			const crm = cellRowMasks_Movements[cellRowIndex].format();
			const lvo = curLevel.mapCellContents.format();
			const lvm = curLevel.mapCellContents_Movements.format();
			console.log(`cro=${cro} crm=${crm} lvo=${lvo} lvm=${lvm} => ${match}`);
		}
        if (match.length===0) {
            return [];
        } else {
            matches.push(match);
        }
    }
    return matches;
};

Rule.prototype.directional = function(){
  //Check if other rules in its rulegroup with the same line number.
  for (var i=0;i<state.rules.length;i++){
    var rg = state.rules[i];
    var copyCount=0;
    for (var j=0;j<rg.length;j++){
      if (this.lineNumber===rg[j].lineNumber){
        copyCount++;
      }
      if (copyCount>1){
        return true;
      }
    }
  }

    return false;
}

Rule.prototype.applyAt = function(level,tuple,check,delta) {
	var rule = this;
	//have to double check they apply 
	//(cf test ellipsis bug: rule matches two candidates, first replacement invalidates second)
	if (check)
	{
		for (var cellRowIndex=0; cellRowIndex<this.patterns.length; cellRowIndex++)
		{
			if (this.ellipsisCount[cellRowIndex]===1)
			{
				if ( this.cellRowMatches[cellRowIndex](
						this.patterns[cellRowIndex], 
						tuple[cellRowIndex][0], 
						tuple[cellRowIndex][1]+1, 
							tuple[cellRowIndex][1], 
						delta, level.objects, level.movements
					).length == 0 )
					return false
			} else if (this.ellipsisCount[cellRowIndex]===2){
				if ( this.cellRowMatches[cellRowIndex](
					this.patterns[cellRowIndex], 
						tuple[cellRowIndex][0],  
						tuple[cellRowIndex][1]+tuple[cellRowIndex][2]+1, 
							tuple[cellRowIndex][1]+tuple[cellRowIndex][2], 
						tuple[cellRowIndex][1]+1, 
							tuple[cellRowIndex][1],  
						tuple[cellRowIndex][2]+1, 
							tuple[cellRowIndex][2], 
							delta, level.objects, level.movements
						).length == 0 )
				return false
			} else {
				if ( ! this.cellRowMatches[cellRowIndex](
					this.patterns[cellRowIndex], 
						tuple[cellRowIndex], 
						delta, level.objects, level.movements
						) )
				return false
		}
	}
	}


    var result=false;
	var anyellipses=false;
	const cellIndexes = [];

    //APPLY THE RULE
    for (var cellRowIndex=0;cellRowIndex<rule.patterns.length;cellRowIndex++) {
        var preRow = rule.patterns[cellRowIndex];
    	var ellipse_index=0;

        var currentIndex = rule.ellipsisCount[cellRowIndex]>0 ? tuple[cellRowIndex][0] : tuple[cellRowIndex];
        for (var cellIndex=0;cellIndex<preRow.length;cellIndex++) {
            var preCell = preRow[cellIndex];

            if (preCell === ellipsisPattern) {
            	var k = tuple[cellRowIndex][1+ellipse_index];
				ellipse_index++;
				anyellipses=true;
            	currentIndex += delta*k;
            	continue;
            }

            result = preCell.replace(rule, currentIndex) || result;
			cellIndexes.push(currentIndex);

            currentIndex += delta;
        }
    }
	perfCounters.applied++;

  	if (verbose_logging && result){
    	var ruleDirection = dirMaskName[rule.direction];
    	if (!rule.directional()){
      		ruleDirection="";
    	}

		var inspect_ID =  addToDebugTimeline(level,rule.lineNumber);
		const locations = cellIndexes.map(i => `(${1 + i % level.width};${1 + ~~(i / level.width)})`).join(', ');
		var gapMessage= (debugSwitch.includes('gaploc')) ? ` at ${locations}` : '';

		//var gapMessage="";
		// var gapcount=0;
		// if (anyellipses){
		// 	var added=0;
		// 	for(var i=0;i<tuple.length;i++){
		// 		var tuples_cellrow = tuple[i];
		// 		//Start at index 1 because index 0 just is the index where the rule starts.
		// 		for (var j=1;j<tuples_cellrow.length;j++){
		// 			added++;
		// 			if (gapMessage.length>0){
		// 				gapMessage+=", ";
		// 			}
		// 			gapMessage+=tuples_cellrow[j];
		// 		}			
		// 	}
		// 	if (added===1){
		// 		gapMessage = " (ellipsis gap of length "+gapMessage+")";
		// 	} else {
		// 		gapMessage = " (ellipsis gaps of length "+gapMessage+")";
		// 	}
		// }
		
		var logString = `<font color="green">Rule <a onclick="jumpToLine(${rule.lineNumber});"  href="javascript:void(0);">${rule.lineNumber}</a> ${ruleDirection} applied${gapMessage}.</font>`;
		consolePrint(logString,false,rule.lineNumber,inspect_ID);
	}
	if (debugSwitch.includes('perf') && perfCounters.applied % 100 == 0) console.log(`Applied ${perfCounters.applied} rules in ${Date.now() - perfCounters.start}ms.`);		
    return result;
};

Rule.prototype.tryApply = function(level) {
	perfCounters.rules++;
	const delta = level.delta_index(this.direction);

    //get all cellrow matches
    var matches = this.findMatches();
	perfCounters.matches += matches.length;
    if (matches.length===0) {
      return false;
    }
	perfCounters.matched++;
	let commandRepeatCount = 1;
	let commandTuples = null;
	const hasMatchScopedCommands = this.commands && this.commands.some(cmd =>
		cmd && (cmd[0] === 'border' || cmd[0] === 'extraborder' || cmd[0] === 'savestate' || cmd[0] === 'loadstate'));

    var result=false;	
	if (this.hasReplacements) {
	perfCounters.replaces++;
	var tuples = generateTuples(matches);
		commandTuples = tuples;
		commandRepeatCount = Math.max(1, tuples.length);
	    for (var tupleIndex=0;tupleIndex<tuples.length;tupleIndex++) {
	        var tuple = tuples[tupleIndex];
	        var shouldCheck=tupleIndex>0;
	        var success = this.applyAt(level,tuple,shouldCheck,delta);
			if (success) perfCounters.replaced++;
	        result = success || result;
	    }
	}
	if (!commandTuples && hasMatchScopedCommands) {
		commandTuples = generateTuples(matches);
		commandRepeatCount = Math.max(1, commandTuples.length);
	}

    if (matches.length>0) {
      this.queueCommands(commandRepeatCount, commandTuples);
    }
    return result;
};

const borderForwardByRuleDirection = {
	1: 'up',
	2: 'down',
	4: 'left',
	8: 'right'
};

const borderRelativeByForward = {
	'right': { '^': 'up', 'v': 'down', '<': 'left', '>': 'right' },
	'up': { '^': 'left', 'v': 'right', '<': 'down', '>': 'up' },
	'down': { '^': 'right', 'v': 'left', '<': 'up', '>': 'down' },
	'left': { '^': 'down', 'v': 'up', '<': 'right', '>': 'left' }
};

function parseBorderCommand(commandArg, ruleDirectionMask) {
	const args = (commandArg || '').trim().split(/[\s,]+/).filter(Boolean);
	if (args.length < 2) {
		return null;
	}

	let directionToken = args[0].toLowerCase();
	const amountToken = args[1];
	if (!/^[-+]?\d+$/.test(amountToken)) {
		return null;
	}
	let amount = parseInt(amountToken, 10);
	if (!isFinite(amount) || isNaN(amount) || amount === 0) {
		return null;
	}

	if (['up', 'down', 'left', 'right'].indexOf(directionToken) < 0) {
		const forward = borderForwardByRuleDirection[ruleDirectionMask] || 'right';
		const mapped = borderRelativeByForward[forward][directionToken];
		if (!mapped) {
			return null;
		}
		directionToken = mapped;
	}

	return {
		direction: directionToken,
		amount: amount
	};
}

function getQueuedBorderCommands(commandQueue) {
	const ret = [];
	for (const queued of commandQueue) {
		if (typeof queued !== 'string' || !queued.startsWith('border,')) {
			continue;
		}
		const parts = queued.split(',');
		if (parts.length !== 3) {
			continue;
		}
		const amount = parseInt(parts[2], 10);
		if (!isFinite(amount) || isNaN(amount) || amount === 0) {
			continue;
		}
		ret.push({
			direction: parts[1],
			amount: amount
		});
	}
	return ret;
}

function getMainBoardBounds(level = curLevel) {
	if (!level) {
		return null;
	}

	const widthRaw = isFinite(level.mainBoardWidth) ? Math.floor(level.mainBoardWidth) : level.width;
	const heightRaw = isFinite(level.mainBoardHeight) ? Math.floor(level.mainBoardHeight) : level.height;
	const width = Math.max(1, Math.min(level.width, widthRaw));
	const height = Math.max(1, Math.min(level.height, heightRaw));
	return { width, height };
}

function getExtraBoardBounds(level = curLevel) {
	if (!state || !state.extraBoardEnabled || !level) {
		return null;
	}

	const widthRaw = isFinite(level.extraBoardWidth) ? Math.floor(level.extraBoardWidth) : 1;
	const heightRaw = isFinite(level.extraBoardHeight) ? Math.floor(level.extraBoardHeight) : 1;
	const width = Math.max(1, Math.min(level.width, widthRaw));
	const height = Math.max(1, Math.min(level.height, heightRaw));
	return { width, height };
}

function ensureExtraCellStates(level = curLevel) {
	if (!level.extraCellStates || typeof level.extraCellStates !== 'object') {
		level.extraCellStates = {};
	}
	return level.extraCellStates;
}

function getExtraCellKeyFromIndex(index, level = curLevel) {
	if (!state || !state.extraBoardEnabled || !level || !isFinite(index) || isNaN(index)) {
		return null;
	}
	const extraBounds = getExtraBoardBounds(level);
	if (!extraBounds) {
		return null;
	}
	const x = ((index / level.height) | 0);
	const y = (index % level.height);
	if (x < 0 || y < 0 || x >= extraBounds.width || y >= extraBounds.height) {
		return null;
	}
	return `${x},${y}`;
}

function captureMainBoardState(level = curLevel) {
	const mainBounds = getMainBoardBounds(level);
	const baseMask = getBaseObjectMask();
	if (!mainBounds || !baseMask) {
		return null;
	}

	const data = new Array(mainBounds.width * mainBounds.height * STRIDE_OBJ).fill(0);
	for (let x = 0; x < mainBounds.width; x++) {
		for (let y = 0; y < mainBounds.height; y++) {
			const srcIndex = y + x * level.height;
			const dstIndex = (y + x * mainBounds.height) * STRIDE_OBJ;
			// getCell() returns a live view into level.objects, so clone before masking.
			const cell = level.getCell(srcIndex).clone();
			cell.iand(baseMask);
			for (let w = 0; w < STRIDE_OBJ; w++) {
				data[dstIndex + w] = cell.data[w];
			}
		}
	}

	return {
		width: mainBounds.width,
		height: mainBounds.height,
		data: data
	};
}

function applyMainBoardState(snapshot, level = curLevel) {
	if (!snapshot || !level || !isFinite(snapshot.width) || !isFinite(snapshot.height) || !Array.isArray(snapshot.data)) {
		return false;
	}
	const newMainWidth = Math.max(1, Math.floor(snapshot.width));
	const newMainHeight = Math.max(1, Math.floor(snapshot.height));
	const expectedLen = newMainWidth * newMainHeight * STRIDE_OBJ;
	if (snapshot.data.length < expectedLen) {
		return false;
	}

	const extraSnapshot = snapshotExtraBoard(level);
	const extraBounds = getExtraBoardBounds(level) || { width: 1, height: 1 };
	const newWidth = Math.max(newMainWidth, extraBounds.width);
	const newHeight = Math.max(newMainHeight, extraBounds.height);

	const newObjects = new Int32Array(newWidth * newHeight * STRIDE_OBJ);
	const bgMask = new BitVec(STRIDE_OBJ);
	bgMask.ibitset(state.backgroundid);
	for (let i = 0; i < newWidth * newHeight; i++) {
		for (let w = 0; w < STRIDE_OBJ; w++) {
			newObjects[i * STRIDE_OBJ + w] = bgMask.data[w];
		}
	}

	for (let x = 0; x < newMainWidth; x++) {
		for (let y = 0; y < newMainHeight; y++) {
			const srcIndex = (y + x * newMainHeight) * STRIDE_OBJ;
			const dstIndex = (y + x * newHeight) * STRIDE_OBJ;
			for (let w = 0; w < STRIDE_OBJ; w++) {
				newObjects[dstIndex + w] = snapshot.data[srcIndex + w] | 0;
			}
		}
	}

	level.width = newWidth;
	level.height = newHeight;
	level.n_tiles = newWidth * newHeight;
	level.objects = newObjects;
	level.mainBoardWidth = newMainWidth;
	level.mainBoardHeight = newMainHeight;

	if (extraSnapshot) {
		restoreExtraBoard(level, extraSnapshot);
	} else {
		clampExtraBoardBounds(level);
	}
	pruneObjectsOutsideBoardBounds(level);
	RebuildLevelArrays();
	calculateRowColMasks();
	return true;
}

function runStateCellCommand(commandName, matchedTuples, rule) {
	if (!state || !state.extraBoardEnabled || !Array.isArray(matchedTuples) || matchedTuples.length === 0) {
		return 0;
	}

	const level = curLevel;
	const extraBounds = getExtraBoardBounds(level);
	const levelHeightAtMatch = level.height;
	if (!extraBounds || levelHeightAtMatch <= 0) {
		return 0;
	}

	const targetIndices = [];
	for (const tuple of matchedTuples) {
		if (!Array.isArray(tuple) || tuple.length === 0) {
			continue;
		}
		const idx = tuple[0];
		if (!isFinite(idx) || isNaN(idx)) {
			continue;
		}
		targetIndices.push(idx | 0);
	}
	if (targetIndices.length === 0) {
		return 0;
	}

	const store = ensureExtraCellStates(level);
	const targetKeys = [];
	for (const index of targetIndices) {
		const x = ((index / levelHeightAtMatch) | 0);
		const y = (index % levelHeightAtMatch);
		if (x < 0 || y < 0 || x >= extraBounds.width || y >= extraBounds.height) {
			continue;
		}
		targetKeys.push(`${x},${y}`);
	}
	if (targetKeys.length === 0) {
		return 0;
	}

	let applied = 0;
	for (const key of targetKeys) {
		if (commandName === 'savestate') {
			const snap = captureMainBoardState(level);
			if (!snap) {
				continue;
			}
			store[key] = snap;
			applied++;
		} else if (commandName === 'loadstate') {
			const snap = store[key];
			if (!snap) {
				continue;
			}
			if (applyMainBoardState(snap, level)) {
				applied++;
			}
		}
	}

	if (verbose_logging && rule) {
		const inspect_ID = addToDebugTimeline(curLevel, rule.lineNumber);
		const logString = htmlColor('green',
			`Rule ${htmlJump(rule.lineNumber)} triggers command ${commandName} (${applied > 0 ? `applied x${applied}` : 'ignored'}).`);
		consolePrint(logString, false, rule.lineNumber, inspect_ID);
	}
	return applied;
}

function getBaseObjectMask() {
	if (!state || !state.extraBoardEnabled || !state.extraIdByBaseId) {
		return null;
	}

	const mask = new BitVec(STRIDE_OBJ);
	for (const baseIdText of Object.keys(state.extraIdByBaseId)) {
		const baseId = parseInt(baseIdText, 10);
		if (isFinite(baseId) && !isNaN(baseId)) {
			mask.ibitset(baseId);
		}
	}
	return mask.iszero() ? null : mask;
}

function getExtraObjectMask() {
	if (!state || !state.extraBoardEnabled || !state.extraIdByBaseId) {
		return null;
	}

	const mask = new BitVec(STRIDE_OBJ);
	for (const baseIdText of Object.keys(state.extraIdByBaseId)) {
		const extraId = state.extraIdByBaseId[baseIdText];
		if (extraId !== undefined) {
			mask.ibitset(extraId);
		}
	}
	return mask.iszero() ? null : mask;
}

function pruneObjectsOutsideBoardBounds(level = curLevel) {
	if (!state || !state.extraBoardEnabled || !level) {
		return false;
	}

	const mainBounds = getMainBoardBounds(level);
	const extraBounds = getExtraBoardBounds(level);
	if (!mainBounds || !extraBounds) {
		return false;
	}

	level.mainBoardWidth = mainBounds.width;
	level.mainBoardHeight = mainBounds.height;
	level.extraBoardWidth = extraBounds.width;
	level.extraBoardHeight = extraBounds.height;
	const stateStore = ensureExtraCellStates(level);
	for (const key of Object.keys(stateStore)) {
		const parts = key.split(',');
		if (parts.length !== 2) {
			delete stateStore[key];
			continue;
		}
		const x = parseInt(parts[0], 10);
		const y = parseInt(parts[1], 10);
		if (!isFinite(x) || isNaN(x) || !isFinite(y) || isNaN(y)
			|| x < 0 || y < 0 || x >= extraBounds.width || y >= extraBounds.height) {
			delete stateStore[key];
		}
	}

	const baseMask = getBaseObjectMask();
	const extraMask = getExtraObjectMask();
	if (!baseMask && !extraMask) {
		return false;
	}

	const mainBgLayerMask = (state.backgroundlayer !== undefined)
		? state.layerMasks[state.backgroundlayer]
		: null;
	const mainBgMask = (state.backgroundid !== undefined)
		? (() => {
			const mask = new BitVec(STRIDE_OBJ);
			mask.ibitset(state.backgroundid);
			return mask;
		})()
		: null;
	const bgLayerMask = (state.extraBackgroundlayer !== undefined)
		? state.layerMasks[state.extraBackgroundlayer]
		: null;
	const bgMask = (state.extraBackgroundid !== undefined)
		? (() => {
			const mask = new BitVec(STRIDE_OBJ);
			mask.ibitset(state.extraBackgroundid);
			return mask;
		})()
		: null;

	let changed = false;
	for (let x = 0; x < level.width; x++) {
		for (let y = 0; y < level.height; y++) {
			const idx = y + x * level.height;
			const outsideMain = x >= mainBounds.width || y >= mainBounds.height;
			const outsideExtra = x >= extraBounds.width || y >= extraBounds.height;
			const cell = level.getCell(idx);
			let cellChanged = false;

			if (outsideMain && baseMask && baseMask.anyBitsInCommon(cell)) {
				cell.iclear(baseMask);
				cellChanged = true;
			} else if (!outsideMain && mainBgMask && mainBgLayerMask && !mainBgLayerMask.anyBitsInCommon(cell)) {
				cell.ior(mainBgMask);
				cellChanged = true;
			}
			if (outsideExtra && extraMask && extraMask.anyBitsInCommon(cell)) {
				cell.iclear(extraMask);
				cellChanged = true;
			} else if (!outsideExtra && bgMask && bgLayerMask && !bgLayerMask.anyBitsInCommon(cell)) {
				cell.ior(bgMask);
				cellChanged = true;
			}

			if (cellChanged) {
				level.setCell(idx, cell);
				changed = true;
			}
		}
	}

	return changed;
}

function clampExtraBoardBounds(level = curLevel) {
	pruneObjectsOutsideBoardBounds(level);
}

function snapshotExtraBoard(level = curLevel) {
	const bounds = getExtraBoardBounds(level);
	const extraMask = getExtraObjectMask();
	if (!bounds || !extraMask) {
		return null;
	}

	const data = new Int32Array(bounds.width * bounds.height * STRIDE_OBJ);
	for (let x = 0; x < bounds.width; x++) {
		for (let y = 0; y < bounds.height; y++) {
			const srcIndex = y + x * level.height;
			const dstIndex = (y + x * bounds.height) * STRIDE_OBJ;
			// getCell() returns a live view into level.objects, so clone before masking.
			const cell = level.getCell(srcIndex).clone();
			cell.iand(extraMask);
			for (let w = 0; w < STRIDE_OBJ; w++) {
				data[dstIndex + w] = cell.data[w];
			}
		}
	}

	return {
		width: bounds.width,
		height: bounds.height,
		data: data
	};
}

function restoreExtraBoard(level, snapshot) {
	if (!snapshot) {
		return;
	}

	const extraMask = getExtraObjectMask();
	if (!extraMask) {
		return;
	}

	level.extraBoardWidth = snapshot.width;
	level.extraBoardHeight = snapshot.height;

	for (let i = 0; i < level.n_tiles; i++) {
		const cell = level.getCell(i);
		cell.iclear(extraMask);
		level.setCell(i, cell);
	}

	const copyWidth = Math.min(snapshot.width, level.width);
	const copyHeight = Math.min(snapshot.height, level.height);
	for (let x = 0; x < copyWidth; x++) {
		for (let y = 0; y < copyHeight; y++) {
			const dstIndex = (y + x * level.height) * STRIDE_OBJ;
			const srcIndex = (y + x * snapshot.height) * STRIDE_OBJ;
			for (let w = 0; w < STRIDE_OBJ; w++) {
				level.objects[dstIndex + w] |= snapshot.data[srcIndex + w];
			}
		}
	}

	clampExtraBoardBounds(level);
}

function normalizeBorderAmount(direction, amount, width, height) {
	let clamped = amount;
	const minWidth = 1;
	const minHeight = 1;

	if (direction === 'left' || direction === 'right') {
		if (amount < 0) {
			clamped = Math.max(amount, minWidth - width);
		}
	} else if (direction === 'up' || direction === 'down') {
		if (amount < 0) {
			clamped = Math.max(amount, minHeight - height);
		}
	} else {
		clamped = 0;
	}
	return clamped;
}

function applyBorderResize(direction, amount) {
	const mainBounds = getMainBoardBounds(curLevel);
	if (!mainBounds) {
		return false;
	}
	const oldMainWidth = mainBounds.width;
	const oldMainHeight = mainBounds.height;
	const oldWidth = curLevel.width;
	const oldHeight = curLevel.height;
	const extraSnapshot = snapshotExtraBoard(curLevel);
	const oldMovements = curLevel.movements;
	const oldRigidApplied = curLevel.rigidMovementAppliedMask;
	const oldRigidGroups = curLevel.rigidGroupIndexMask;
	const effectiveAmount = normalizeBorderAmount(direction, amount, oldMainWidth, oldMainHeight);
	if (effectiveAmount === 0) {
		return false;
	}

	const newMainWidth = oldMainWidth + ((direction === 'left' || direction === 'right') ? effectiveAmount : 0);
	const newMainHeight = oldMainHeight + ((direction === 'up' || direction === 'down') ? effectiveAmount : 0);
	const extraBounds = getExtraBoardBounds(curLevel) || { width: 1, height: 1 };
	const newWidth = Math.max(newMainWidth, extraBounds.width);
	const newHeight = Math.max(newMainHeight, extraBounds.height);
	if (newMainWidth <= 0 || newMainHeight <= 0 || newWidth <= 0 || newHeight <= 0) {
		return false;
	}

	const oldObjects = curLevel.objects;
	const newObjects = new Int32Array(newWidth * newHeight * STRIDE_OBJ);
	const newMovements = new Int32Array(newWidth * newHeight * STRIDE_MOV);
	const newRigidApplied = [];
	const newRigidGroups = [];
	const bgMask = new BitVec(STRIDE_OBJ);
	bgMask.ibitset(state.backgroundid);
	for (let i = 0; i < newWidth * newHeight; i++) {
		for (let w = 0; w < STRIDE_OBJ; w++) {
			newObjects[i * STRIDE_OBJ + w] = bgMask.data[w];
		}
	}

	let xShift = 0;
	let yShift = 0;
	if (direction === 'left') {
		xShift = effectiveAmount;
	} else if (direction === 'up') {
		yShift = effectiveAmount;
	}

	for (let x = 0; x < oldWidth; x++) {
		for (let y = 0; y < oldHeight; y++) {
			const nx = x + xShift;
			const ny = y + yShift;
			if (nx < 0 || ny < 0 || nx >= newWidth || ny >= newHeight) {
				continue;
			}
			const oldIndex = y + x * oldHeight;
			const newIndex = ny + nx * newHeight;
			for (let w = 0; w < STRIDE_OBJ; w++) {
				newObjects[newIndex * STRIDE_OBJ + w] = oldObjects[oldIndex * STRIDE_OBJ + w];
			}
			for (let w = 0; w < STRIDE_MOV; w++) {
				newMovements[newIndex * STRIDE_MOV + w] = oldMovements[oldIndex * STRIDE_MOV + w];
			}
			newRigidApplied[newIndex] = oldRigidApplied[oldIndex] ? oldRigidApplied[oldIndex].clone() : new BitVec(STRIDE_MOV);
			newRigidGroups[newIndex] = oldRigidGroups[oldIndex] ? oldRigidGroups[oldIndex].clone() : new BitVec(STRIDE_MOV);
		}
	}

	curLevel.width = newWidth;
	curLevel.height = newHeight;
	curLevel.n_tiles = newWidth * newHeight;
	curLevel.objects = newObjects;
	curLevel.mainBoardWidth = newMainWidth;
	curLevel.mainBoardHeight = newMainHeight;
	if (extraSnapshot) {
		restoreExtraBoard(curLevel, extraSnapshot);
	} else {
		clampExtraBoardBounds(curLevel);
	}
	pruneObjectsOutsideBoardBounds(curLevel);
	RebuildLevelArrays();
	curLevel.movements = newMovements;
	for (let i = 0; i < curLevel.n_tiles; i++) {
		curLevel.rigidMovementAppliedMask[i] = newRigidApplied[i] || new BitVec(STRIDE_MOV);
		curLevel.rigidGroupIndexMask[i] = newRigidGroups[i] || new BitVec(STRIDE_MOV);
	}
	calculateRowColMasks();
	return true;
}

function applyExtraBorderResize(direction, amount) {
	if (!state || !state.extraBoardEnabled) {
		return false;
	}

	const mainBounds = getMainBoardBounds(curLevel);
	const extraBounds = getExtraBoardBounds(curLevel);
	if (!mainBounds || !extraBounds) {
		return false;
	}

	const oldExtraWidth = extraBounds.width;
	const oldExtraHeight = extraBounds.height;
	const effectiveAmount = normalizeBorderAmount(direction, amount, oldExtraWidth, oldExtraHeight);
	if (effectiveAmount === 0) {
		return false;
	}

	const newExtraWidth = oldExtraWidth + ((direction === 'left' || direction === 'right') ? effectiveAmount : 0);
	const newExtraHeight = oldExtraHeight + ((direction === 'up' || direction === 'down') ? effectiveAmount : 0);
	if (newExtraWidth <= 0 || newExtraHeight <= 0) {
		return false;
	}

	const newWidth = Math.max(mainBounds.width, newExtraWidth);
	const newHeight = Math.max(mainBounds.height, newExtraHeight);
	if (newWidth <= 0 || newHeight <= 0) {
		return false;
	}

	const mainSnapshot = captureMainBoardState(curLevel);
	if (!mainSnapshot) {
		return false;
	}

	let oldExtra = snapshotExtraBoard(curLevel);
	if (!oldExtra) {
		oldExtra = {
			width: oldExtraWidth,
			height: oldExtraHeight,
			data: new Int32Array(oldExtraWidth * oldExtraHeight * STRIDE_OBJ)
		};
	}

	const extraBgMask = new BitVec(STRIDE_OBJ);
	if (state.extraBackgroundid !== undefined) {
		extraBgMask.ibitset(state.extraBackgroundid);
	}
	const newExtraData = new Int32Array(newExtraWidth * newExtraHeight * STRIDE_OBJ);
	for (let i = 0; i < newExtraWidth * newExtraHeight; i++) {
		for (let w = 0; w < STRIDE_OBJ; w++) {
			newExtraData[i * STRIDE_OBJ + w] = extraBgMask.data[w];
		}
	}

	let xShift = 0;
	let yShift = 0;
	if (direction === 'left') {
		xShift = effectiveAmount;
	} else if (direction === 'up') {
		yShift = effectiveAmount;
	}

	for (let x = 0; x < oldExtra.width; x++) {
		for (let y = 0; y < oldExtra.height; y++) {
			const nx = x + xShift;
			const ny = y + yShift;
			if (nx < 0 || ny < 0 || nx >= newExtraWidth || ny >= newExtraHeight) {
				continue;
			}
			const srcIndex = (y + x * oldExtra.height) * STRIDE_OBJ;
			const dstIndex = (ny + nx * newExtraHeight) * STRIDE_OBJ;
			for (let w = 0; w < STRIDE_OBJ; w++) {
				newExtraData[dstIndex + w] = oldExtra.data[srcIndex + w];
			}
		}
	}

	const mainBgMask = new BitVec(STRIDE_OBJ);
	mainBgMask.ibitset(state.backgroundid);
	const newObjects = new Int32Array(newWidth * newHeight * STRIDE_OBJ);
	for (let i = 0; i < newWidth * newHeight; i++) {
		for (let w = 0; w < STRIDE_OBJ; w++) {
			newObjects[i * STRIDE_OBJ + w] = mainBgMask.data[w];
		}
	}

	for (let x = 0; x < mainSnapshot.width; x++) {
		for (let y = 0; y < mainSnapshot.height; y++) {
			const srcIndex = (y + x * mainSnapshot.height) * STRIDE_OBJ;
			const dstIndex = (y + x * newHeight) * STRIDE_OBJ;
			for (let w = 0; w < STRIDE_OBJ; w++) {
				newObjects[dstIndex + w] = mainSnapshot.data[srcIndex + w] | 0;
			}
		}
	}

	for (let x = 0; x < newExtraWidth; x++) {
		for (let y = 0; y < newExtraHeight; y++) {
			const srcIndex = (y + x * newExtraHeight) * STRIDE_OBJ;
			const dstIndex = (y + x * newHeight) * STRIDE_OBJ;
			for (let w = 0; w < STRIDE_OBJ; w++) {
				newObjects[dstIndex + w] |= newExtraData[srcIndex + w];
			}
		}
	}

	curLevel.width = newWidth;
	curLevel.height = newHeight;
	curLevel.n_tiles = newWidth * newHeight;
	curLevel.objects = newObjects;
	curLevel.mainBoardWidth = mainBounds.width;
	curLevel.mainBoardHeight = mainBounds.height;
	curLevel.extraBoardWidth = newExtraWidth;
	curLevel.extraBoardHeight = newExtraHeight;

	pruneObjectsOutsideBoardBounds(curLevel);
	RebuildLevelArrays();
	calculateRowColMasks();
	return true;
}

function applyQueuedBorderCommands(commandQueue, dryRun = false) {
	if (!state || !state.metadata || !state.metadata.runtime_border_twiddling) {
		return false;
	}
	const borders = getQueuedBorderCommands(commandQueue);
	if (borders.length === 0) {
		return false;
	}

	if (dryRun) {
		let changed = false;
		const mainBounds = getMainBoardBounds(curLevel) || { width: curLevel.width, height: curLevel.height };
		let width = mainBounds.width;
		let height = mainBounds.height;
		for (const border of borders) {
			const effectiveAmount = normalizeBorderAmount(border.direction, border.amount, width, height);
			if (effectiveAmount === 0) {
				continue;
			}
			changed = true;
			if (border.direction === 'left' || border.direction === 'right') {
				width += effectiveAmount;
			} else if (border.direction === 'up' || border.direction === 'down') {
				height += effectiveAmount;
			}
		}
		return changed;
	}

	let changed = false;
	for (const border of borders) {
		if (applyBorderResize(border.direction, border.amount)) {
			changed = true;
		}
	}
	return changed;
}

Rule.prototype.queueCommands = function(repeatCount = 1, matchedTuples = null) {
	var commands = this.commands;
	perfCounters.commands += commands.length;	
	if (commands.length==0){
		return;
	}
	const borderRepeatCount = Math.max(1, Math.floor(repeatCount) || 1);

	//commandQueue is an array of strings, message.commands is an array of array of strings (For messagetext parameter), so I search through them differently
	var preexisting_cancel=curLevel.commandQueue.indexOf("cancel")>=0;
	var preexisting_restart=curLevel.commandQueue.indexOf("restart")>=0;
	
	var currule_cancel = false;
	var currule_restart = false;
	for (var i=0;i<commands.length;i++){
		var cmd = commands[i][0];
		if (cmd==="cancel"){
			currule_cancel=true;
		} else if (cmd==="restart"){
			currule_restart=true;
		}
	}

	//priority cancel > restart > everything else
	//if cancel is the queue from other rules, ignore everything
	if (preexisting_cancel){
		return;
	}
	//if restart is in the queue from other rules, only apply if there's a cancel present here
	if (preexisting_restart && !currule_cancel){
		return;
	}

	//if you are writing a cancel or restart, clear the current queue
	if (currule_cancel || currule_restart){
		curLevel.commandQueue=[];
        curLevel.commandQueueSourceRules=[];
		messagetext="";
		statusText = "";
	}

	for(var i=0;i<commands.length;i++) {
		var command=commands[i];
		var queuedCommand = command[0];
		if (command[0] == 'log') {		// log is not queued
			consolePrintFromRule(`${command[1]}`, this, true);
			continue;
		} else if (command[0] == 'gosub') {			// gosub is not queued
			gosubTarget = command[1];
			continue;
		} else if (command[0] == 'savestate' || command[0] == 'loadstate') {
			runStateCellCommand(command[0], matchedTuples, this);
			continue;
		} else if (command[0] == 'border' || command[0] == 'extraborder') {
			if (!state || !state.metadata || !state.metadata.runtime_border_twiddling) {
				continue;
			}
			if (command[0] === 'extraborder' && (!state.extraBoardEnabled || !state.metadata.extra_board)) {
				continue;
			}
			const border = parseBorderCommand(command[1], this.direction);
			if (!border) {
				continue;
			}
			let resizeCount = 0;
			for (let rep = 0; rep < borderRepeatCount; rep++) {
				const applied = (command[0] === 'extraborder')
					? applyExtraBorderResize(border.direction, border.amount)
					: applyBorderResize(border.direction, border.amount);
				if (applied) {
					resizeCount++;
				}
			}
			if (verbose_logging) {
				const inspect_ID = addToDebugTimeline(curLevel, this.lineNumber);
				const result = resizeCount > 0 ? `applied x${resizeCount}` : "ignored";
				const logString = htmlColor('green',
					`Rule ${htmlJump(this.lineNumber)} triggers command ${command[0]} ${border.direction} ${border.amount} (${result}, immediate).`);
				consolePrint(logString, false, this.lineNumber, inspect_ID);
			}
			continue;
		} else if (curLevel.commandQueue.indexOf(command[0])>=0) {
			continue;
		}
		curLevel.commandQueue.push(queuedCommand);
		curLevel.commandQueueSourceRules.push(this);

		if (verbose_logging) {
			const inspect_ID =  addToDebugTimeline(curLevel, this.lineNumber);
			const logString = htmlColor('green', `Rule ${htmlJump(this.lineNumber)} triggers command ${queuedCommand}.`);
			consolePrint(logString, false, this.lineNumber, inspect_ID);
		}

		if (command[0] == 'message') {
			messagetext=command[1];
		} else if (command[0] == 'goto') {
			curLevel.commandQueue.pop();
			curLevel.commandQueue.push(`${command[0]},${command[1]}`);
		} else if (command[0] == 'status') {
			statusText = command[1];
		}		

		if (state.metadata.runtime_metadata_twiddling && twiddleable_params.includes(command[0])) {

			value = command[1];

			if (value == "wipe") {
				delete state.metadata[command[0]]; //value = undefined;
				value = null;
			} else if (value == "default") {
				value = deepClone(state.default_metadata[command[0]]);
			}

			if (value != null) {
				state.metadata[command[0]] = value;
			}
			
			if (command[0] === "zoomscreen" || command[0] === "flickscreen") {
				//twiddleMetaData(state, true);
				twiddleMetaData(state, command);
				canvasResize();
			}

			if (command[0] === "smoothscreen") {
				if (value !== undefined) {
					//twiddleMetaData(state, true);
					twiddleMetaData(state, command);
					initSmoothCamera()
				} else {
					smoothscreen = false;
				}
				canvasResize();
			}

			if (command[0] == "color_palette") {
				//twiddleMetaData(state, true);
				twiddleMetaData(state, command);
				regenSpriteImages()
				canvasResize();
			}

			twiddleMetadataExtras()

			if (state.metadata.runtime_metadata_twiddling_debug) {
				var log = "Metadata twiddled: Flag "+command[0] + " set to " + value;
				if (value != command[1]) {
					log += " ("+command[1]+")"
				}
				consolePrintFromRule(log,this,true);
				canvasResize();
			}
    	}   
  	}
};

// set various prelude settings from metadata, either initially or when twiddled
function twiddleMetadataExtras(resetAutoTick = true) {
    if (debugSwitch.includes('meta')) console.log(`twiddleMetaDataExtras resetAutoTick=${resetAutoTick} metadata:`, state.metadata);
	autotickinterval=state.metadata.realtime_interval ? state.metadata.realtime_interval*1000 : 0;
	if (resetAutoTick || !state.metadata.realtime_interval)
    	autotick=0;
	againinterval = state.metadata.again_interval ? state.metadata.again_interval*1000 : 150;
	tweeninterval = state.metadata.tween_length ? Math.max(state.metadata.tween_length*1000, 0) : 0;
	repeatinterval = state.metadata.key_repeat_interval ? state.metadata.key_repeat_interval*1000 : 200; // was 150, makes for key bounce
	animateinterval = state.metadata.animate_interval ? state.metadata.animate_interval*1000 : 250; // was 150, makes for key bounce

	const colorPalette = state.metadata.color_palette;
	state.bgcolor = state.metadata.background_color ? colorToHex(colorPalette,state.metadata.background_color) : "#000000";
	state.fgcolor = state.metadata.text_color ? colorToHex(colorPalette,state.metadata.text_color) : "#FFFFFF";
    state.author_color = state.metadata.author_color ? colorToHex(colorPalette, state.metadata.author_color) : state.fgcolor;
    state.title_color = state.metadata.title_color ? colorToHex(colorPalette, state.metadata.title_color) : state.fgcolor;
    state.keyhint_color = state.metadata.keyhint_color ? colorToHex(colorPalette, state.metadata.keyhint_color) : state.fgcolor;
}

function showTempMessage(message) {
if (solving) {return;}

	keybuffer=[];
	textMode=true;
	titleScreen=false;
	quittingMessageScreen=false;
	messageselected=false;
	ignoreNotJustPressedAction=true;
	tryPlayShowMessageSound();
	drawMessageScreen(message);
	canvasResize();
}

function processOutputCommands(commands) {
	for (var i=0;i<commands.length;i++) {
		var command = commands[i];
		if (command.charAt(1)==='f')  {//identifies sfxN
			tryPlaySimpleSound(command);
		}
		if (unitTesting===false) {
			if (command == 'message') {
				showTempMessage(messagetext);
			}
		}
	}
}

function applyRandomRuleGroup(level,ruleGroup) {
	perfCounters.randoms++;
	var propagated=false;

	var matches=[];
	for (var ruleIndex=0;ruleIndex<ruleGroup.length;ruleIndex++) {
		var rule=ruleGroup[ruleIndex];
		var ruleMatches = rule.findMatches();
		if (ruleMatches.length>0) {
	    	var tuples  = generateTuples(ruleMatches);
	    	for (var j=0;j<tuples.length;j++) {
	    		var tuple=tuples[j];
				matches.push([ruleIndex,tuple]);
	    	}
		}		
	}

  if (matches.length===0)
  {
    return false;
  } 

	var match = matches[Math.floor(RandomGen.uniform()*matches.length)];
	var ruleIndex=match[0];
	var rule=ruleGroup[ruleIndex];
	var tuple=match[1];
	var check=false;
	const delta = level.delta_index(rule.direction)
	var modified = rule.applyAt(level,tuple,check,delta);

    rule.queueCommands(1, [tuple]);

  return modified;
}


function applyRuleGroup(ruleGroup) {
	perfCounters.groups++;
	if (ruleGroup[0].isRandom) {
		return applyRandomRuleGroup(curLevel,ruleGroup);
	}

  	var loopPropagated=false;
    var propagated=true;
    var loopcount=0;
	var nothing_happened_counter = -1;
    while(propagated) {
		loopcount++;
		if (loopcount>200) {
			logErrorCacheable("Got caught looping lots in a rule group :O",ruleGroup[0].lineNumber,true);
			break;
		}
        propagated=false;

        for (var ruleIndex=0;ruleIndex<ruleGroup.length;ruleIndex++) {
            var rule = ruleGroup[ruleIndex];     
			if (rule.tryApply(curLevel)){
				if (!rule.isOnce)
					propagated=true;
				nothing_happened_counter=0;//why am I resetting to 1 rather than 0? because I've just verified that applications of the current rule are exhausted
			} else {
				nothing_happened_counter++;
			}
			if ( nothing_happened_counter === ruleGroup.length)
				break;
        }
        if (propagated) {
        	loopPropagated=true;
			
			if (verbose_logging){
				debugger_turnIndex++;
				addToDebugTimeline(curLevel,-2);//pre-movement-applied debug state
			}
        }
    }

    return loopPropagated;
}

function applyRules(rules, loopPoint, subroutines, startRuleGroupindex, bannedGroup){
	//console.log(`Apply rules rules:${rules.length} objects:${level.objects}`);

	// find the end of this block of rule groups
	function findEnd(start) {
		let result = -1;
		if (start < rules.length) {
			// find the subroutine after the one we are in, if any
			// note: trouble if it's an ==
			let x = subroutines.findIndex(s => s.lineNumber > rules[start][0].lineNumber);
			// find the rule group for that line number
			if (x != -1)
				result = rules.findIndex(r => r[0].lineNumber >= subroutines[x].lineNumber) 
		}
		return (result == -1) ? rules.length : result;
	}

	perfCounters.tries++;
    //for each rule
    //try to match it

    playerPositions = getPlayerPositions();
	
	// stack of rule group index to return to at end of subroutine
	const gosubStack = []; // PS>

    //when we're going back in, let's loop, to be sure to be sure
    let loopPropagated = startRuleGroupindex > 0;
    let loopCount = 0;
	let endIndex = findEnd(startRuleGroupindex);
    for (let ruleGroupIndex = startRuleGroupindex; ruleGroupIndex < endIndex; ) {
		// first process the rule and check for endloop
		if (bannedGroup && bannedGroup[ruleGroupIndex]) {
			//do nothing
		} else {
			const ruleGroup = rules[ruleGroupIndex];
			loopPropagated = applyRuleGroup(ruleGroup) || loopPropagated;
		}
		// loop ends right here
        if (loopPropagated && loopPoint[ruleGroupIndex] >= 0) { 
			if (checkLoop())
				break; 
		} else {
			if (gosubTarget >= 0) {
				// push current location so on return we can check if at end
				gosubStack.push(ruleGroupIndex);  // todo: push loop point
				if (verbose_logging)
					consolePrint(`Gosub to ${htmlJump(rules[gosubTarget][0].lineNumber)}`, true, rules[ruleGroupIndex][0].lineNumber);
				ruleGroupIndex = gosubTarget;
				endIndex = findEnd(ruleGroupIndex);
				gosubTarget = -1;
				//console.log(`gosub group:${ruleGroupIndex} line:${rules[ruleGroupIndex][0].lineNumber}`)
				if (debugSwitch.includes('gosub')) console.log(`gosub1 group:${ruleGroupIndex} line:${rules[ruleGroupIndex][0].lineNumber} endindex:${endIndex}`, gosubStack);
			} else {
				ruleGroupIndex++;
				// note special for loops and gosubs that end after the last rule
				if (ruleGroupIndex == endIndex && loopPropagated && loopPoint[ruleGroupIndex] >= 0) {
					if (checkLoop())
						break; 
				}		

				// loop to handle stacked returns
				while (ruleGroupIndex == endIndex && gosubStack.length > 0) {
					if (verbose_logging)
						consolePrint(`Return to ${htmlJump(rules[gosubStack.at(-1)][0].lineNumber)}`, true);
					ruleGroupIndex = gosubStack.pop();
					endIndex = findEnd(ruleGroupIndex);
					ruleGroupIndex++;
					if (debugSwitch.includes('gosub')) console.log(`gosub2 group:${ruleGroupIndex} line:${rules[ruleGroupIndex][0].lineNumber} endindex:${endIndex}`, gosubStack);
				}
			}
		}

		if (verbose_logging){
			debugger_turnIndex++;
			addToDebugTimeline(curLevel,-2);//pre-movement-applied debug state
		}

		function checkLoop() {
			ruleGroupIndex = loopPoint[ruleGroupIndex];
			loopPropagated = false;
			loopCount++;
			if (loopCount > 200) {
				var ruleGroup = rules[ruleGroupIndex];
				logErrorCacheable("got caught in an endless startloop...endloop vortex, escaping!", ruleGroup[0].lineNumber, true);
				return true;
			}	
		}
	}
}

//if this returns!=null, need to go back and reprocess
function resolveMovements(level, bannedGroup, dontModify) {
	var moved=true;

    while(moved){
        moved=false;
        for (var i=0;i<level.n_tiles;i++) {
			moved = repositionEntitiesAtCell(i, dontModify) || moved;
        }
    }
    var doUndo=false;

	//Search for any rigidly-caused movements remaining
	for (var i=0;i<level.n_tiles;i++) {
		var cellMask = level.getCellInto(i,_o6);
		var movementMask = level.getMovements(i);
		if (!movementMask.iszero()) {
			var rigidMovementAppliedMask = level.rigidMovementAppliedMask[i];
			if (!rigidMovementAppliedMask.iszero()) {
				movementMask.iand(rigidMovementAppliedMask);
				if (!movementMask.iszero()) {
					//find what layer was restricted
					for (var j=0;j<level.layerCount;j++) {
						var layerSection = movementMask.getshiftor(MOV_MASK, MOV_BITS * j);
						if (layerSection!==0) {
							//this is our layer!
							var rigidGroupIndexMask = level.rigidGroupIndexMask[i];
							var rigidGroupIndex = rigidGroupIndexMask.getshiftor(MOV_MASK, MOV_BITS * j);
							rigidGroupIndex--;//group indices start at zero, but are incremented for storing in the bitfield
							var groupIndex = state.rigidGroupIndex_to_GroupIndex[rigidGroupIndex];
							if (bannedGroup[groupIndex]!==true){
								bannedGroup[groupIndex]=true
							//backtrackTarget = rigidBackups[rigidGroupIndex];
							doUndo=true;
							}
							break;
						}
					}
				}
			}
			// go through each of the fx masks to see if it applies to an object in this cell
			for (const fx of state.sfx_MovementFailureMasks) {
				if (cellMask.get(fx.objId)) {
					if (movementMask.anyBitsInCommon(fx.directionMask)) {
						const object = getObject(fx.objId);
						if (verbose_logging) 
							consolePrint(`Object "${state.idDict[object]}" can't move, playing seed "${seedsToPlay_CantMove[i]}"`)
						if (fx.seed.startsWith('afx')) {
							const move = getLayerMovement(movementMask, object.layer);
							seedsToAnimate[i+','+fx.objId] = { 
								kind: 'cant', 
								seed: fx.seed, 
								dir: move 
							};
						}
						else if (seedsToPlay_CantMove.indexOf(fx.seed)===-1)
							seedsToPlay_CantMove.push(fx.seed);
					}
				}
			}
    	}

    	for (var j=0;j<STRIDE_MOV;j++) {
    		level.movements[j+i*STRIDE_MOV]=0;
    	}
	    level.rigidGroupIndexMask[i].setZero();
	    level.rigidMovementAppliedMask[i].setZero();
    }
    return doUndo;
}

var sfxCreateMask=null;			// doc: mask for all objects created
var sfxDestroyMask=null;		// doc: mask for all objects destroyed
var sfxCreateList = []; 		// doc: list of created { posindex:, objmask: }
var sfxDestroyList = [];		// doc: list of destroyed { posindex:, objmask: }

function calculateRowColMasks() {
	for(var i=0;i<curLevel.mapCellContents.length;i++) {
		curLevel.mapCellContents[i]=0;
		curLevel.mapCellContents_Movements[i]=0;	
	}

	for (var i=0;i<curLevel.width;i++) {
		var ccc = curLevel.colCellContents[i];
		ccc.setZero();
		var ccc_Movements = curLevel.colCellContents_Movements[i];
		ccc_Movements.setZero();
	}

	for (var i=0;i<curLevel.height;i++) {
		var rcc = curLevel.rowCellContents[i];
		rcc.setZero();
		var rcc_Movements = curLevel.rowCellContents_Movements[i];
		rcc_Movements.setZero();
	}

	for (var i=0;i<curLevel.width;i++) {
		for (var j=0;j<curLevel.height;j++) {
			var index = j+i*curLevel.height;
			var cellContents=curLevel.getCellInto(index,_o9);
			curLevel.mapCellContents.ior(cellContents);
			curLevel.rowCellContents[j].ior(cellContents);
			curLevel.colCellContents[i].ior(cellContents);

			
			var mapCellContents_Movements=curLevel.getMovementsInto(index,_m1);
			curLevel.mapCellContents_Movements.ior(mapCellContents_Movements);
			curLevel.rowCellContents_Movements[j].ior(mapCellContents_Movements);
			curLevel.colCellContents_Movements[i].ior(mapCellContents_Movements);
		}
	}
}

var playerPositions;
var playerPositionsAtTurnStart;

// process inputs specific to level (code copied from testing framework)
function processLevelInput() {
	const input = state.levels[curLevelNo].input;
	if (!input) return;
	if (verbose_logging)
		consolePrint(`Processing level input ${input}`);
	const inputDat = input.split(',');
	state.levels[curLevelNo].input = null;

	for (const val of inputDat) {
		if (val==="undo") {
			DoUndo(false,true);
		} else if (val==="restart") {
			DoRestart();
		} else if (val==="tick") {
			processInput(-1);
		} else if (String(val).startsWith('actionkey,')) {
			const args = String(val).split(',');
			actionKeyInput(parseInt(args[1], 10));
		} else {
			processInput(dirNames.indexOf(val));
		}
		while (againing) {
			againing=false;
			processInput(-1);			
		}
	}

}

// acceptable input directions, used here and in inputoutput
var dirNames = ['up', 'left', 'down', 'right', 'action', 'mouse', 'lclick', 'rclick'];  // todo: reaction, mclick

var perfCounters = {};

/* returns a bool indicating if anything changed */
function processInput(dir,dontDoWin,dontModify,bak,coord) {
	//console.log(`Process input (${dir},${dontDoWin},${dontModify},${bak},${coord}) cmds=${level.commandQueue}`)
	perfCounters = {
		start: Date.now(),
		rules: 0,
		matched: 0,
		matches: 0,
		replaces: 0,
		replaced: 0,
		applied: 0,
		commands: 0,
		randoms : 0,
		groups: 0,
		tries: 0,		
	}
	if (debugSwitch.includes('profile')) console.profile('INP');
	const ret = procInp(dir, dontDoWin, dontModify, bak, coord);
	if (debugSwitch.includes('profile')) console.profileEnd('INP');
	perfCounters.elapsed = Date.now() - perfCounters.start;
	if (debugSwitch.includes('perf')) console.log(perfCounters);
	return ret;
}
function procInp(dir,dontDoWin,dontModify,bak,coord) {
	if (!dontModify) {
		newMovedEntities = {};
	}

	//var startDir = dir;

	againing = false;

	if (bak==undefined) {
		bak = backupLevel();
	}
  
	// this looks dodgy, but playerPositions is not used and dir test always succeeds
  	playerPositions= [];
	playerPositionsAtTurnStart = getPlayerPositions();
	
	if (dir < dirNames.length) {

		if (verbose_logging) { 
			debugger_turnIndex++;
			addToDebugTimeline(curLevel,-2);//pre-movement-applied debug state
		}

		const dirName = dirNames[dir];

		// todo: reaction
		if ([ 0,1,2,3,4 ].includes(dir)) {		// arrows plus action go to player 
			playerPositions = startMovement(dirMasks[dirName]);
		} else if ([ 6,7 ].includes(dir)) {			// clicks go to object(s)
			const mask = curLevel.getCell(coord);
			moveEntitiesAtIndex(coord, mask, dirMasks[dirName]);
		}

		if (verbose_logging) { 
			const inspect_ID = addToDebugTimeline(curLevel, -1);
			if (dir===-1) {
				consolePrint(`Turn starts with no input.`, false, null, inspect_ID)
			} else {
				//  consolePrint('=======================');
				consolePrint(`Turn starts with input of ${dirName}.`, false, null, inspect_ID);
			}
			consolePrint('Applying rules.');
		}
		
        var bannedGroup = [];

        curLevel.commandQueue=[];
        curLevel.commandQueueSourceRules=[];
        var startRuleGroupIndex=0;
        var rigidloop=false;
		const startState = {
			objects: new Int32Array(curLevel.objects),
			movements: new Int32Array(curLevel.movements),
			rigidGroupIndexMask: curLevel.rigidGroupIndexMask.concat([]),
			rigidMovementAppliedMask: curLevel.rigidMovementAppliedMask.concat([]),
			commandQueue: [],
			commandQueueSourceRules: []
		}
	    sfxCreateMask.setZero();
	    sfxDestroyMask.setZero();
		sfxCreateList = [];
		sfxDestroyList = [];
		
		seedsToPlay_CanMove=[];
		seedsToPlay_CantMove=[];
		seedsToAnimate={};
		
		calculateRowColMasks();

		var alreadyResolved=[];
		if (dir != -1) 		// clear status line on user input
			statusText = "";

        var i=0;
        do {
        //not particularly elegant, but it'll do for now - should copy the world state and check
        //after each iteration
        	rigidloop=false;
        	i++;

			applyRules(state.rules, state.loopPoint, state.subroutines, startRuleGroupIndex, bannedGroup);
        	var shouldUndo = resolveMovements(curLevel, bannedGroup, dontModify);
			
        	if (shouldUndo) {
        		rigidloop=true;

				{
					// trackback
					if (IDE){
						// newBannedGroups is the list of keys of bannedGroup that aren't already in alreadyResolved
						var newBannedGroups = [];
						for (var key in bannedGroup) {
							if (!alreadyResolved.includes(key)) {
								newBannedGroups.push(key);
								alreadyResolved.push(key);
							}
						}
						var bannedLineNumbers = newBannedGroups.map( rgi => state.rules[rgi][0].lineNumber);
						var ts = bannedLineNumbers.length>1 ? "lines " : "line ";
						ts += bannedLineNumbers.map(ln => `<a onclick="jumpToLine(${ln});" href="javascript:void(0);">${ln}</a>`).join(", ");
						consolePrint(`Rigid movement application failed in rule-Group starting from ${ts}, and will be disabled in resimulation. Rolling back...`)
					}
					//don't need to concat or anythign here, once something is restored it won't be used again.
					curLevel.objects = new Int32Array(startState.objects)
					curLevel.movements = new Int32Array(startState.movements)
					curLevel.rigidGroupIndexMask = startState.rigidGroupIndexMask.concat([])
					curLevel.rigidMovementAppliedMask = startState.rigidMovementAppliedMask.concat([])
					// TODO: shouldn't we also save/restore the level data computed by level.calculateRowColMasks() ?
					curLevel.commandQueue = startState.commandQueue.concat([])
					curLevel.commandQueueSourceRules = startState.commandQueueSourceRules.concat([])
					sfxCreateMask.setZero()
					sfxDestroyMask.setZero()
					sfxCreateList = [];
					sfxDestroyList = [];

				}

				if (verbose_logging && rigidloop && i>0){				
					consolePrint('Relooping through rules because of rigid.');
						
					debugger_turnIndex++;
					addToDebugTimeline(curLevel,-2);//pre-movement-applied debug state
				}

        		startRuleGroupIndex=0;//rigidGroupUndoDat.ruleGroupIndex+1;
        	} else {
        		if (verbose_logging){

					var eof_idx = debug_visualisation_array[debugger_turnIndex].length+1;//just need some number greater than any rule group
					var inspect_ID = addToDebugTimeline(curLevel,eof_idx);

					consolePrint(`Processed movements.`,false,null,inspect_ID);
					
					if (state.lateRules.length>0){
											
						debugger_turnIndex++;
						addToDebugTimeline(curLevel,-2);//pre-movement-applied debug state
					
						consolePrint('Applying late rules.');
					}
				}
        		applyRules(state.lateRules, state.lateLoopPoint, state.subroutines, 0);
        		startRuleGroupIndex=0;
        	}
        } while (i < 250 && rigidloop);

        if (i>=250) {
          consolePrint("looped through 250 times, gave up. Too many loops!");
          
          applyRules(state.lateRules, state.lateLoopPoint, state.subroutines, 0);
          startRuleGroupIndex=0;
          
          backups.push(bak);
          DoUndo(true,false);
          return false;
        }

		/// Taken from zarawesome, thank you :)
		if (curLevel.commandQueue.indexOf('undo')>=0) {
			if (verbose_logging) {
				consoleCacheDump();
				consolePrint('UNDO command executed, undoing turn.',true);
			}
			messagetext = "";
			DoUndo(true,false, true, true, true);
			return true;
		}

		// kludge to avoid triggering error
		//console.log('cmdq', curLevel.commandQueue);
		if (curLevel.commandQueue.find(c => c.startsWith('goto'))) {
			const cmd = curLevel.commandQueue.find(c => c.startsWith('goto'));
			gotoLevel(cmd.substr(5));
			return true;
		}

		if (curLevel.commandQueue.includes('link')) {
			gotoLink();
			return true;
		}

        if (playerPositionsAtTurnStart.length>0 && state.metadata.require_player_movement!==undefined && dir >= 0) {
        	var somemoved=false;
        	for (var i=0;i<playerPositionsAtTurnStart.length;i++) {
        		var pos = playerPositionsAtTurnStart[i];
        		var val = curLevel.getCell(pos);
        		if (state.playerMask.bitsClearInArray(val.data)) {
        			somemoved=true;
        			break;
        		}
        	}
        	if (somemoved===false) {
        		if (verbose_logging){
	    			consolePrint('require_player_movement set, but no player movement detected, so cancelling turn.');
	    			consoleCacheDump();
				}
        		addUndoState(bak);
        		DoUndo(true,false, false);
        		return false;
        	}
        	//play player cantmove sounds here
        }



	    if (curLevel.commandQueue.indexOf('cancel')>=0) {
	    	if (verbose_logging) { 
	    		consoleCacheDump();
	    		var r = curLevel.commandQueueSourceRules[curLevel.commandQueue.indexOf('cancel')];
	    		consolePrintFromRule('CANCEL command executed, cancelling turn.',r,true);
			}

			if (!dontModify){
			processOutputCommands(curLevel.commandQueue);
			}

			var commandsleft = curLevel.commandQueue.length>1;

    		addUndoState(bak);
    		DoUndo(true,false, false, false);
    		tryPlayCancelSound();
    		return commandsleft;
	    } 

	    if (curLevel.commandQueue.indexOf('restart')>=0) {
			
    		if (verbose_logging && runrulesonlevelstart_phase){
				var r = curLevel.commandQueueSourceRules[curLevel.commandQueue.indexOf('restart')];
    			logWarning('A "restart" command is being triggered in the "run_rules_on_level_start" section of level creation, which would cause an infinite loop if it was actually triggered, but it\'s being ignored, so it\'s not.',r.lineNumber,true);
    		}

	    	if (verbose_logging) { 
	    		const r = curLevel.commandQueueSourceRules[curLevel.commandQueue.indexOf('restart')];
	    		consolePrintFromRule('RESTART command executed, reverting to restart state.', r);
	    		consoleCacheDump();
			}
			if (!dontModify){
				processOutputCommands(curLevel.commandQueue);
			}
    		addUndoState(bak);

			if (!dontModify){
	    		DoRestart(true);
			}
		}
		
		if (curLevel.commandQueue.indexOf('quit')>=0 && !solving) {
			if (verbose_logging) { 
				var r = curLevel.commandQueueSourceRules[curLevel.commandQueue.indexOf('quit')];
				consolePrintFromRule('QUIT command executed, exiting level.',r);
				consoleCacheDump();
			}
			if (state.metadata.enable_pause) {
				goToPauseScreen(); 
			} else if (state.metadata.level_select !== undefined) {
				titleSelection = null;
				gotoLevelSelectScreen();
			} else {
				goToTitleScreen();
			}
			messagetext = "";
			canvasResize();	
			return true;
		}

		const outOfBoundsPruned = pruneObjectsOutsideBoardBounds(curLevel);
		if (dontModify && outOfBoundsPruned) {
			if (verbose_logging) {
				consoleCacheDump();
			}
			return true;
		}

		var save_backup = true;
		if(!winning && curLevel.commandQueue.indexOf('nosave')>=0) {
			if (verbose_logging) { 
				var r = curLevel.commandQueueSourceRules[curLevel.commandQueue.indexOf('nosave')];
				consolePrintFromRule('NOSAVE command executed, not storing current state to undo queue.',r);
			}
			save_backup = false;
	    }
	    
        var modified=false;
		const boardSizeChanged =
			(curLevel.width!==bak.width) ||
			(curLevel.height!==bak.height);
		var changed = 
			outOfBoundsPruned ||
			boardSizeChanged ||
			(curLevel.objects.length!==bak.dat.length);

		if (!changed) {
	    	for (var i=0;i<curLevel.objects.length;i++) {
	    		if (curLevel.objects[i]!==bak.dat[i]) {
	    			changed = true;
	    			break;
	    		}
	    	}
		}

		if (changed) {
			if (dontModify) {
	        	if (verbose_logging) {
	        		consoleCacheDump();
	        	}
	        	addUndoState(bak);
	        	DoUndo(true,false, false);
				return true;
			} else {
				if (dir!==-1 && save_backup) {
					addUndoState(bak);
				} else if (backups.length > 0) {
					// This is for the case that diffs break the undo buffer for real-time games 
					// ( c f https://github.com/increpare/PuzzleScript/pull/796 ),
					// because realtime ticks are ignored when the user presses undo and the backup
					// array reflects this structure.  
					backups[backups.length - 1] = unconsolidateDiff(backups[backups.length - 1], bak);					
	    		}
	    		modified=true;
	    		updateCameraPositionTarget();
	    	}
		}

		if (dontModify && curLevel.commandQueue.indexOf('win')>=0 || curLevel.commandQueue.indexOf('restart')>=0) {	
	    	return true;	
		}
		
		if (dontModify) {		
    		if (verbose_logging) {
    			consoleCacheDump();
    		}
			return false;
		}

		// move completed, survived so far, look at sounds to play
		// move and cant were added during rule processing
        for (var i=0;i<seedsToPlay_CantMove.length;i++) {			
            playSeed(seedsToPlay_CantMove[i]);
        }

        for (var i=0;i<seedsToPlay_CanMove.length;i++) {
            playSeed(seedsToPlay_CanMove[i]);
        }

		// create and destroy were added ???
		for (const entry of state.sfx_CreationMasks) {
			if (sfxCreateMask.get(entry.objId)) {		// mask for objects created vs mask for sfx create event
				if (entry.seed.startsWith('afx')) {
					for (const fx of sfxCreateList) {
						if (fx.objId == entry.objId) {
							if (verbose_logging) consolePrint(`Created object "${state.idDict[entry.objId]}", playing seed "${entry.seed}"`);
							seedsToAnimate[fx.posIndex+','+fx.objId] = { kind: 'create', seed: entry.seed };
						}
					}
				} else {
					if (verbose_logging) consolePrint(`Created object "${state.idDict[entry.objId]}", playing seed "${entry.seed}"`);
					playSeed(entry.seed);
				}
			}
		}
  
		for (const entry of state.sfx_DestructionMasks) {
			if (sfxDestroyMask.get(entry.objId)) {
				if (entry.seed.startsWith('afx')) {
					for (const fx of sfxDestroyList) {
						if (fx.objId == entry.objId) {
							if (verbose_logging) consolePrint(`Destroyed object "${state.idDict[entry.objId]}", playing seed "${entry.seed}"`);
							seedsToAnimate[fx.posIndex+','+fx.objId] = { kind: 'destroy', seed: entry.seed };
						}
					}
				} else {
					if (verbose_logging) consolePrint(`Destroyed object "${state.idDict[entry.objId]}", playing seed "${entry.seed}"`);
					playSeed(entry.seed);
				}
			}
		}
  
		if (!dontModify){
	    	processOutputCommands(curLevel.commandQueue);
		}

	    if (textMode===false) {
	    	if (verbose_logging) { 
	    		consolePrint('Checking win conditions.');
			}
			if (dontDoWin===undefined){
				dontDoWin = false;
			}
	    	checkWin( dontDoWin );
	    }

	    if (!winning) {
			if (curLevel.commandQueue.indexOf('checkpoint')>=0) {
		    	if (verbose_logging) { 
	    			var r = curLevel.commandQueueSourceRules[curLevel.commandQueue.indexOf('checkpoint')];
		    		consolePrintFromRule('CHECKPOINT command executed, saving current state to the restart state.',r);
				}
				restartTarget=backupLevel();		// fix for twiddle issues #67 #73 and reopen
				//restartTarget=level4Serialization();
				hasUsedCheckpoint=true;
				var backupStr = JSON.stringify(restartTarget);
				storage_set(document.URL+'_checkpoint',backupStr);
				storage_set(document.URL,curLevelNo);				
			}	 

		    if (curLevel.commandQueue.indexOf('again')>=0 && modified) {

	    		var r = curLevel.commandQueueSourceRules[curLevel.commandQueue.indexOf('again')];

		    	//first have to verify that something's changed
		    	var old_verbose_logging=verbose_logging;
		    	var oldmessagetext = messagetext;
				const oldseedsToAnimate = seedsToAnimate;
		    	verbose_logging=false;
		    	if (processInput(-1,true,true)) {
			    	verbose_logging=old_verbose_logging;

			    	if (verbose_logging) { 
			    		consolePrintFromRule('AGAIN command executed, with changes detected - will execute another turn.',r);
					}

			    	againing=true;
			    	timer=0;
			    } else {		    	
			    	verbose_logging=old_verbose_logging;
					if (verbose_logging) { 
						consolePrintFromRule('AGAIN command not executed, it wouldn\'t make any changes.',r);
					}
			    }
			    verbose_logging=old_verbose_logging;
			    messagetext = oldmessagetext;
				seedsToAnimate = oldseedsToAnimate;
		    }   
		}
		
		if (verbose_logging) { 
			consolePrint(`Turn complete.`);    
		}

		currentMovedEntities = newMovedEntities;
		tweentimer = 0;
		
	    curLevel.commandQueue=[];
	    curLevel.commandQueueSourceRules=[];
		if (debugSwitch.includes('anim')) console.log(`Animate: ${JSON.stringify(seedsToAnimate)}`);
		if (!dontModify && boardSizeChanged) {
			canvasResize();
		}

    }

  if (verbose_logging) {
    consoleCacheDump();
  }

  if (winning) {
    againing=false;
  }

  return true; // might beneeded for an animation
  //return modified;
}

// play a seed which could be a sound or an animation
function playSeed(seed, ignore) {
	if (seed)
		playSound(seed, ignore);
	// else nothing yet

}

function checkWin(dontDoWin) {

  if (levelEditorOpened) {
    dontDoWin=true;
  }

	if (curLevel.commandQueue.indexOf('win')>=0) {
		if (runrulesonlevelstart_phase){
			consolePrint("Win Condition Satisfied (However this is in the run_rules_on_level_start rule pass, so I'm going to ignore it for you.  Why would you want to complete a level before it's already started?!)");		
		} else {
			if (verbose_logging && !solving) {
				consolePrint("Win Condition Satisfied.");
			}
		}
		if(!dontDoWin){
			DoWin();
		}
		return;
	}

	function mapMaskToScope(mask, scope) {
		if (!mask || !state || !state.extraBoardEnabled || !state.baseIdByExtraId || !state.extraIdByBaseId) {
			return mask;
		}
		if (scope === 'main') {
			const mapped = new BitVec(STRIDE_OBJ);
			for (let id = 0; id < state.objectCount; id++) {
				if (!mask.get(id)) continue;
				if (state.baseIdByExtraId[id] !== undefined) {
					continue;
				}
				let targetId = id;
				if (state.baseIdByExtraId[id] !== undefined) {
					targetId = state.baseIdByExtraId[id];
				} else if (state.extraIdByBaseId[id] !== undefined) {
					targetId = id;
				}
				if (isFinite(targetId) && targetId >= 0) {
					mapped.ibitset(targetId);
				}
			}
			return mapped;
		}
		if (scope === 'extra') {
			const mapped = new BitVec(STRIDE_OBJ);
			for (let id = 0; id < state.objectCount; id++) {
				if (!mask.get(id)) continue;
				let targetId = id;
				if (state.baseIdByExtraId[id] !== undefined) {
					targetId = id;
				} else if (state.extraIdByBaseId[id] !== undefined) {
					targetId = state.extraIdByBaseId[id];
				}
				if (isFinite(targetId) && targetId >= 0) {
					mapped.ibitset(targetId);
				}
			}
			return mapped;
		}
		return mask;
	}

	function evaluateWinconditionInScope(wincondition, scope) {
		const bounds = (scope === 'extra') ? getExtraBoardBounds(curLevel) : getMainBoardBounds(curLevel);
		if (!bounds) {
			return false;
		}
		const width = bounds.width;
		const height = bounds.height;
		const filter1 = mapMaskToScope(wincondition[1], scope);
		const filter2 = mapMaskToScope(wincondition[2], scope);
		const aggr1 = wincondition[4];
		const aggr2 = wincondition[5];

		let rulePassed = true;
		const f1 = aggr1 ? c => filter1.bitsSetInArray(c) : c => !filter1.bitsClearInArray(c);
		const f2 = aggr2 ? c => filter2.bitsSetInArray(c) : c => !filter2.bitsClearInArray(c);

		switch(wincondition[0]) {
			case -1: // NO
			{
				for (let x = 0; x < width; x++) {
					for (let y = 0; y < height; y++) {
						const i = y + x * curLevel.height;
						const cell = curLevel.getCellInto(i, _o10);
						if ((f1(cell.data)) && (f2(cell.data))) {
							rulePassed = false;
							break;
						}
					}
					if (!rulePassed) break;
				}
				break;
			}
			case 0: // SOME
			{
				let passedTest = false;
				for (let x = 0; x < width; x++) {
					for (let y = 0; y < height; y++) {
						const i = y + x * curLevel.height;
						const cell = curLevel.getCellInto(i, _o10);
						if ((f1(cell.data)) && (f2(cell.data))) {
							passedTest = true;
							break;
						}
					}
					if (passedTest) break;
				}
				if (passedTest === false) {
					rulePassed = false;
				}
				break;
			}
			case 1: // ALL
			{
				for (let x = 0; x < width; x++) {
					for (let y = 0; y < height; y++) {
						const i = y + x * curLevel.height;
						const cell = curLevel.getCellInto(i, _o10);
						if ((f1(cell.data)) && (!f2(cell.data))) {
							rulePassed = false;
							break;
						}
					}
					if (!rulePassed) break;
				}
				break;
			}
		}
		return rulePassed;
	}

	var won= false;
	if (state.winconditions.length>0)  {
		let passed = true;
		for (let wcIndex = 0; wcIndex < state.winconditions.length; wcIndex++) {
			const wincondition = state.winconditions[wcIndex];
			const mainPassed = evaluateWinconditionInScope(wincondition, 'main');
			const extraPassed = (state && state.extraBoardEnabled) ? evaluateWinconditionInScope(wincondition, 'extra') : mainPassed;
			const rulePassed = (state && state.extraBoardEnabled && wincondition[0] === 0)
				? (mainPassed || extraPassed)
				: (mainPassed && extraPassed);
			if (!rulePassed) {
				passed = false;
				break;
			}
		}
		won = passed;
	}

	if (won) {
		if (runrulesonlevelstart_phase){
			consolePrint("Win Condition Satisfied (However this is in the run_rules_on_level_start rule pass, so I'm going to ignore it for you.  Why would you want to complete a level before it's already started?!)");		
		} else {
			if (verbose_logging && !solving) {
				consolePrint("Win Condition Satisfied.");
			}
		}
		if (!dontDoWin){
			DoWin();
		}
	}
}

function DoWin() {
	if (winning) {
		return;
	}
	againing = false;
	tryPlayEndLevelSound();

	if (linkStack.length > 0) { 		// got here by link so go back there
		returnLink();
		processInput(-1, true);			// allow trigger on rules with no movement
		return;
	}

	if (unitTesting) {
		nextLevel();
		return;
	}

	winning = true;
	timer = 0;
}

function nextLevel() {
	if (debugSwitch.includes('load')) console.log(`nextLevel()`, `curLevelNo=${curLevelNo}`);
	againing=false;
	messagetext="";
	statusText = "";
	if (state && state.levels && (curLevelNo>state.levels.length-1) ){
		curLevelNo=state.levels.length-1;
	}
  
  	ignoreNotJustPressedAction=true;
	if (titleScreen && titleMode <= 1) {
		linkStack = [];
		backups = [];
		if(isContinueOptionSelected()) {
			// continue
			loadLevelFromStateOrTarget();
		} else if(isNewGameOptionSelected()) {
			// new game
			const firstAutoLevel = getNextAutoLevelIndex(-1);
			curLevelNo = firstAutoLevel >= 0 ? firstAutoLevel : 0;
			curlevelTarget=null;

			if (state.metadata.level_select === undefined) {
				clearLocalStorage();
			}

			loadLevelFromStateOrTarget();
		} else if(isLevelSelectOptionSelected()) {
			titleSelection = null;
			gotoLevelSelectScreen();
		} else {
			throw "next level";
			// settings -- TODO
		}
	} else {
		if (hasUsedCheckpoint){
			curlevelTarget=null;
			hasUsedCheckpoint=false;
		}

		const nextAutoLevelNo = getNextAutoLevelIndex(curLevelNo);
		if (nextAutoLevelNo >= 0) {
			var skip = false;
			var curSection = state.levels[curLevelNo].section;
			var nextSection = state.levels[nextAutoLevelNo].section;
			if(nextSection != curSection) {
				setSectionSolved(state.levels[curLevelNo].section);

				if(hasSolvedAllTargetSections() && state.winSection != undefined) {
					const winStart = getFirstSectionAutoLevelIndex("__WIN__");
					if (winStart >= 0) {
						curLevelNo = winStart;
						curlevelTarget=null;
						textMode=false;
						titleScreen=false;
						quittingMessageScreen=false;
						loadLevelFromStateOrTarget();
						skip = true;
					} else if (nextSection == "__WIN__") {
						gotoLevelSelectScreen();
						skip = true;
					}
				} else if (nextSection == "__WIN__") {
					gotoLevelSelectScreen();
					skip = true;
				}		
			}

			if(!skip) {
				curLevelNo = nextAutoLevelNo;
				curlevelTarget=null;
				textMode=false;
				titleScreen=false;
				quittingMessageScreen=false;
	
				loadLevelFromStateOrTarget();
			}
		} else {
			if (hasSolvedAllTargetSections()) {
				if (!state.metadata.level_select) {
					// solved all
					try {
						storage_remove(document.URL);
						storage_remove(document.URL + '_checkpoint');
					} catch (ex) {
					}

					curLevelNo = 0;
					curlevelTarget = null;
					goToTitleScreen();
				} else {
					goToTitleScreen();
				}

				tryPlayEndGameSound();
			} else {
				if (state.levels[curLevelNo].section != null) {
					setSectionSolved(state.levels[curLevelNo].section);
				}
				gotoLevelSelectScreen();
			}
		}		
		//continue existing game
	}

	updateLocalStorage();
	resetFlickDat();
	canvasResize();	
	processLevelInput(); 
}

function loadLevelFromStateOrTarget() {
	if (curlevelTarget!==null){			
		loadLevelFromStateTarget(state,curLevelNo,curlevelTarget);
	} else {
		loadLevelFromState(state,curLevelNo);
	}
}

function goToTitleScreen(){
	if (debugSwitch.includes('load')) console.log(`gotoTitleScreen() curlevelTarget=`, curlevelTarget, ` restartTarget=`, restartTarget);
    againing=false;
	messagetext="";
	statusText = "";
	titleScreen=true;
	textMode=true;
	hoverSelection=-1;
	doSetupTitleScreenLevelContinue();
  //titleSelection=showContinueOptionOnTitleScreen()?1:0;
  
  	state.metadata = deepClone(state.default_metadata);
  	twiddleMetadataExtras();

  	if (canvas!==null){//otherwise triggers error in cat bastard test
		regenSpriteImages();
	}
	
	levelSelectScrollPos = 0;
	levelSelectCurrentParent = -1;
	levelSelectEntries = [];
	generateTitleScreen();
}

function resetFlickDat() {
	if (state!==undefined && state.metadata.flickscreen!==undefined){
		oldflickscreendat=[0,0,Math.min(state.metadata.flickscreen[0],curLevel.width),Math.min(state.metadata.flickscreen[1],curLevel.height)];
	}
}

function updateLocalStorage() {
	if (linkStack.length > 0)
		return;
	if (debugSwitch.includes('menu')) console.log(`updateLocalStorage`, 'curlevelTarget=', curlevelTarget, 'restartTarget=', restartTarget, 'curLevelNo=', curLevelNo);
	try {
		
		storage_set(document.URL,curLevelNo);
		if (curlevelTarget!==null){
			restartTarget=backupLevel();		// fix for twiddle issues #67 #73 and reopen
			//restartTarget=level4Serialization();
			var backupStr = JSON.stringify(restartTarget);
			storage_set(document.URL+'_checkpoint',backupStr);
		} else {
			storage_remove(document.URL+"_checkpoint");
		}		
		
	} catch (ex) {
  }
}

function setSectionSolved(section) {
	if(section == null || section == undefined) {
		return;
	}

	if(section == "__WIN__") {
		return;
	}

	const sectionMeta = Array.isArray(state.sections)
		? state.sections.find(s => s && s.name === section)
		: null;
	if (sectionMeta && !isSectionProgressTarget(sectionMeta)) {
		return;
	}

	if(solvedSections.indexOf(section) >= 0) {
		return;
	}

	try {
		if(!!window.localStorage) {
			solvedSections.push(section);
			storage_set(document.URL + "_sections", JSON.stringify(solvedSections));
		}
	} catch(ex) { }
}

function clearLocalStorage() {
	if (debugSwitch.includes('menu')) console.log(`clearLocalStorage`);
	curLevelNo = 0;
	curlevelTarget = null;
	solvedSections = [];

	try {
		if (!!window.localStorage) {
			storage_remove(document.URL);
			storage_remove(document.URL+'_checkpoint');
			storage_remove(document.URL+'_sections');
		}
	} catch(ex){ }
}

var cameraPositionTarget = null;

var cameraPosition = {
  x: 0,
  y: 0
};

function initSmoothCamera() {
    if (debugSwitch.includes('meta')) console.log(`initSmoothCamera metadata:`, state.metadata);
    if (state===undefined || state.metadata.smoothscreen===undefined) {
        return;
    }

    screenwidth=state.metadata.smoothscreen.screenSize.width;
    screenheight=state.metadata.smoothscreen.screenSize.height;

    var boundarySize = state.metadata.smoothscreen.boundarySize;
    var flick = state.metadata.smoothscreen.flick;

    var playerPositions = getPlayerPositions();
    if (playerPositions.length>0) {
        var playerPosition = {
            x: (playerPositions[0]/(curLevel.height))|0,
            y: (playerPositions[0]%curLevel.height)|0
        };

        cameraPositionTarget = {
            x: flick
              ? getFlickCameraPosition(playerPosition.x, curLevel.width, screenwidth, boundarySize.width)
              : getCameraPosition(playerPosition.x, curLevel.width, screenwidth),
            y: flick
              ? getFlickCameraPosition(playerPosition.y, curLevel.height, screenheight, boundarySize.height)
              : getCameraPosition(playerPosition.y, curLevel.height, screenheight)
        };

        cameraPosition.x = cameraPositionTarget.x;
        cameraPosition.y = cameraPositionTarget.y;
    }
}

function getCameraPosition (targetPosition, levelDimension, screenDimension) {
    return Math.min(
        Math.max(targetPosition, Math.floor(screenDimension / 2)),
        levelDimension - Math.ceil(screenDimension / 2)
    );
}

function getFlickCameraPosition (targetPosition, levelDimension, screenDimension, boundaryDimension) {
    var flickGridOffset = (Math.floor(screenDimension / 2) - Math.floor(boundaryDimension / 2));
    var flickGridPlayerPosition = targetPosition - flickGridOffset;
    var flickGridPlayerCell = Math.floor(flickGridPlayerPosition / boundaryDimension);
    var maxFlickGridCell = Math.floor((levelDimension - Math.ceil(screenDimension / 2) - Math.floor(boundaryDimension / 2) - flickGridOffset) / boundaryDimension);

    return Math.min(Math.max(flickGridPlayerCell, 0), maxFlickGridCell) * boundaryDimension + Math.floor(screenDimension / 2);
}

function updateCameraPositionTarget() {
    var smoothscreenConfig = state.metadata.smoothscreen;
    var playerPositions = getPlayerPositions();

    if (!smoothscreenConfig || playerPositions.length === 0) {
        return
    }

    var playerPosition = {
        x: (playerPositions[0]/(curLevel.height))|0,
        y: (playerPositions[0]%curLevel.height)|0
    };

    ['x', 'y'].forEach(function (coord) {
        var screenDimension = coord === 'x' ? screenwidth : screenheight;

        var dimensionName = coord === 'x' ? 'width' : 'height';
        var levelDimension = curLevel[dimensionName];
        var boundaryDimension = smoothscreenConfig.boundarySize[dimensionName];

        var playerVector = playerPosition[coord] - cameraPositionTarget[coord];
        var direction = Math.sign(playerVector);
        var boundaryVector = direction > 0
          ? Math.ceil(boundaryDimension / 2)
          : -(Math.floor(boundaryDimension / 2) + 1);

        if (Math.abs(playerVector) - Math.abs(boundaryVector) >= 0) {
            cameraPositionTarget[coord] = smoothscreenConfig.flick
              ? getFlickCameraPosition(playerPosition[coord], levelDimension, screenDimension, boundaryDimension)
              : getCameraPosition(playerPosition[coord] - boundaryVector + direction, levelDimension, screenDimension);
        }
    })
}


function IsMouseGameInputEnabled() {
	return state.metadata.mouse_left || state.metadata.mouse_up || state.metadata.mouse_drag || state.metadata.mouse_clicks;
}
