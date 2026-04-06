function makeGIF() {
	if (state !== undefined && state.metadata.smoothscreen != null) {
		consolePrint('<span class="errorText">GIF recorder does not work with smoothscreen, sorry. :( You could try an external GIF recording application instead.</span>');
		return;
	}

	var randomseed = RandomGen.seed;
	levelEditorOpened=false;
	var targetlevel=curLevelNo;
	var gifcanvas = document.createElement('canvas');
	gifcanvas.width=screenwidth*cellwidth;
	gifcanvas.height=screenheight*cellheight;
	gifcanvas.style.width=screenwidth*cellwidth;
	gifcanvas.style.height=screenheight*cellheight;

	var gifctx = gifcanvas.getContext('2d');
	gifctx.imageSmoothingEnabled = false;

	var inputDat = inputHistory.concat([]);
	var soundDat = soundHistory.concat([]);
	

	unitTesting=true;
	levelString=compiledText;



	var encoder = new GIFEncoder();
	encoder.setRepeat(0); //auto-loop
	encoder.setDelay(200);
	encoder.start();

	compile(["loadLevel",curLevelNo],levelString,randomseed);
	canvasResize();
	redraw();

	// Draw the current playfield to the GIF canvas, scaling each frame to the
	// largest size that fits while keeping it centered.
	function addGifFrame() {
		var srcW = Math.max(1, (screenwidth * cellwidth) | 0);
		var srcH = Math.max(1, (screenheight * cellheight) | 0);
		var srcX = xoffset | 0;
		var srcY = yoffset | 0;

		var scale = Math.min(gifcanvas.width / srcW, gifcanvas.height / srcH);
		var destW = Math.max(1, Math.floor(srcW * scale));
		var destH = Math.max(1, Math.floor(srcH * scale));
		var destX = Math.floor((gifcanvas.width - destW) / 2);
		var destY = Math.floor((gifcanvas.height - destH) / 2);

		gifctx.fillStyle = state.bgcolor || "#000000";
		gifctx.fillRect(0, 0, gifcanvas.width, gifcanvas.height);
		gifctx.drawImage(canvas, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
		encoder.addFrame(gifctx);
	}

	addGifFrame();
	var autotimer=0;

  	for(var i=0;i<inputDat.length;i++) {
  		var realtimeframe=false;
		var val=inputDat[i];
		if (val == "undo") {
			DoUndo(false,true);
		} else if (val == "restart") {
			DoRestart();
		} else if (val == "tick") {			
			processInput(-1);
			realtimeframe=true;
		} else if (String(val).startsWith('actionkey,')) {
			const args = String(val).split(',');
			actionKeyInput(parseInt(args[1], 10));
		} else if (String(val).startsWith('mouse')) {
			const args = val.split(',');
			mouseInput(args[1], args[2]);
		} else {
			processInput(val);
		}
		redraw();
		addGifFrame();
		encoder.setDelay(realtimeframe?autotickinterval:repeatinterval);
		autotimer+=repeatinterval;

		while (againing) {
			processInput(-1);		
			redraw();
			encoder.setDelay(againinterval);
			addGifFrame();
		}
	}

	encoder.finish();
	const data_url = 'data:image/gif;base64,'+btoa(encoder.stream().getData());
	consolePrint('<img class="generatedgif" src="'+data_url+'">');
	consolePrint('<a href="'+data_url+'" download>Download GIF</a>');
  	
  	unitTesting = false;

    inputHistory = inputDat;
	soundHistory = soundDat;
}
