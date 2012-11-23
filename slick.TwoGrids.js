/**
 * TwoGrids v0.2
 * Copyright (C) 2012 Jonathan Lietzau
 *
 * MIT License - http://github.com/KJLJon/TwoGrids/license
 */
(function($){
	var loader = false;

	/**
	 * AjaxModel
	 * Allows for dynamically loading columns and data
	 * 
	 * JSON PUT:
	 * 		from	(int)
	 * 		to		(int)
	 * 		search	(string)
	 * 		sort	(string)
	 * 		asc		(boolean)
	 * 		loadColumns (boolean)  if it needs to load the columns or not
	 * JSON RESPONSE: (length is the length of total records)
	 * {
	 * 	data:[
	 * 		{
	 * 			data2bind:"adsf"
	 * 		},
	 * 		...
	 * 	],
	 * 	length:123,
	 *  columns:[]
	 * }
	 */ 
	function AjaxModel(options){
		var opts = $.extend({
			url: '',
			optimal: 100,
			search: '',
			sortColumn: null,
			sortAsc: true,
			columns: "columns",
			params: {}, //additional params to POST when ajax
			
			onError: function(fromPage, toPage){
				alert("error loading pages " + fromPage + " to " + toPage);
			},
		}, options);
		var data = {length: 0};
		var loadColumns=(opts.columns!=false);
		var columns = null;
		var req = null; // ajax request

		// events
		var onDataLoading = new Slick.Event(),onDataLoaded = new Slick.Event(),onColumnLoaded = new Slick.Event();

		function clear() {
			for (var key in data){
				delete data[key];
			}
			data.length = 0;
		}
		
		/**
		 * ensureData based off:
		 * http://stackoverflow.com/a/7634911
		 * Updated to allow dynamic columns
		 * Ensures data range is loaded, loading if necessary.
		 */
		function ensureData(from, to){
			// Reduce range to only unloaded data by eliminating already loaded data at the extremes
			// or data which is already being loaded by a pending request
			if (from < 0) {from = 0;}
			while (data[from] !== undefined && from < to){from++;}
			while (data[to] !== undefined && from < to){to--;}

			// no need to load anything
			if (data[from] !== undefined){
				return;
			}

			// A request for data must be made: increase range if below optimal request size
			// to decrease number of requests to the database
			var size = to - from + 1;
			if (size < opts.optimal){
				// expand range in both directions to make it equal to the optimal size
				var expansion = Math.round((opts.optimal - size) / 2);
				from -= expansion;
				to += expansion;

				// if range expansion results in 'from' being less than 0,
				// make it to 0 and transfer its value to 'to' to keep the range size
				if (from < 0) {
					to -= from;
					from = 0;
				}

				// Slide range up or down if data is already loaded or being loaded at the top or bottom...
				if (data[from] !== undefined) {
					while (data[from] !== undefined) {
						from++; 
						to++;
					}
				}
				else if (data[to] !== undefined) {
					while (data[to] !== undefined && from > 0) {
						from--; 
						to--;
					}
				}
			}

			// After adding look-ahead and look-behind, reduce range again to only unloaded 
			// data by eliminating already loaded data at the extremes
			while (data[from] !== undefined && from < to) {from++;}
			while (data[to] !== undefined && from < to) {to--;}

			// clear any pending request
			if(req !== null){
				clearTimeout(req);
			}

			// launch request to server with a delay of 100ms to cater with quick scrolling down
			req = setTimeout(function() {
				// set records in range to null; null indicates a 'requested but not available yet'
				for (var i = from; i <= to; i++) {
					if (!data[i]) {
						data[i] = null; 
					}
				}

				// notify grid (to show loading message) and load through ajax
				onDataLoading.notify({from: from, to: to});
				var params={
					from: from,
					to: to,
					search: opts.search,
					sort: opts.sortColumn,
					asc: opts.sortAsc
				};
				if(loadColumns){
					params.loadColumns=true;
				}
				
				//posts the data
				$.post(opts.url,$.extend(params,opts.params),function(d){
					var length = d.data.length;

					if(data.length != parseInt(d.total)){
						clear();
						data.length = parseInt(d.total);
					}

					if(length != size){
						opts.optimal = length;
						for (var i = from+length-1; i <= to; ++i)
							delete data[i];
					}

					for (var i = 0; i < length; ++i){
						data[from + i] = d.data[i];
						data[from + i].index = from + i;
					}

					if(loadColumns){
						columns=d[opts.columns];
						loadColumns=false;
						onColumnLoaded.notify({columns:columns});
					}

					onDataLoaded.notify({from: from, to: to});
				},'json').error(function(){
					opts.onError(from, to);
				});
			}, 100);
		}

		return {
			// properties
			data: data,
			columns: columns,

			// methods
			clear: clear,
			ensureData: ensureData,
			isDataLoaded: function isDataLoaded(from, to){
				for (var i = from; i <= to; ++i){
					if (data[i] == undefined || data[i] == null){
						return false;
					}
				}
				return true;
			},
			reloadData: function(from, to){
				for (var i = from; i <= to; ++i){
					delete data[i];
				}
				ensureData(from, to);
			},
			reloadColumns: function(){
				if(opts.columns!=false){
					loadColumns=true;
				}
			},
			removeParam: function(param){
				delete opts.params[param];
			},
			setParam: function(param,value){
				opts.params[param] = value;
			},
			setSort: function(column, asc){
				opts.sortColumn = column;
				opts.sortAsc = asc;
				clear();
			},
			setSearch: function(str){
				opts.search = str;
				clear();
			},
			// events
			onDataLoading: onDataLoading,
			onDataLoaded: onDataLoaded,
			onColumnLoaded: onColumnLoaded
		};
	}
	
	/**
	 * RowSelectionModel
	 * Most of the code is based off of
	 * https://github.com/mleibman/SlickGrid/wiki/Handling-selection
	 */
	function RowSelectionModel(){
		var grid;
		var onSelectedRangesChanged = new Slick.Event();
		
		function handleGridClick(e){
			var cell = grid.getCellFromEvent(e);
			if (!cell || !grid.canCellBeSelected(cell.row, cell.cell)){
				return;
			}

			onSelectedRangesChanged.notify([new Slick.Range(cell.row, 0, cell.row, grid.getColumns().length)]);
		};
		
		return {
			"init": function(grd){
				grid = grd;
				grid.onClick.subscribe(handleGridClick);
			},
			"destroy":function(){
				grid.onClick.unsubscribe(x.handleGridClick);
			},
			"onSelectedRangesChanged": onSelectedRangesChanged
		}
	}
	
	/**
	 * SingleGrid
	 * Adds Ajax Param, view (used for changing views of grid)
	 * 
	 */
	function SingleGrid(id,opts){
		var opts = $.extend(true, {
			//ajaxModel options
			ajax: {
				url: '',
			},
			//SlickGrid options
			grid: {
				fullWidthRows: true,
				enableCellNavigation: false
			},
			//args are passed in (whatever SlickGrid passes to these events)
			onClick: function(){},
			onRightClick: function(){},
			onDblClick: function(){},
			
			//					(if it should save order, then size), then all fields
			//posts Columns: [{order:true,size:true},{field: Field-Name, width: Size},...]
			saveColumns:{
				order: true,
				size: true,
				url: '',
				//additional params
				params:{},
				//data is passed into it
				onSave:function(){}
			}
		},opts);
		
		//new Ajax Method
		var model = new AjaxModel(opts.ajax);
		var grid = false;
		
		//When data is loading, show loading screen
		model.onDataLoading.subscribe(function(){
			if(!loader){
				var j=$(id),position = j.position();
				loader = $("<span class='loading-indicator'><label>Buffering...</label></span>");
				loader.css({
					position:"absolute",
					top:position.top+j.height()*.5-loader.height()*.5,
					left:position.left+j.width()*.5-loader.width()*.5
				}).appendTo(document.body);
			}
			loader.show();
		});
		
		//When data is loaded, show rows, and hide loading screen
		model.onDataLoaded.subscribe(function(e,a){
			for(var i = a.from; i <= a.to; ++i){
				grid.invalidateRow(i);
			}
			grid.updateRowCount();
			grid.render();
			loader.fadeOut();
		});

		//When columns are loaded, create the grid
		model.onColumnLoaded.subscribe(function(e,a){
			grid = new Slick.Grid(id, model.data, a.columns, opts.grid);
			grid.setSelectionModel(new RowSelectionModel());
			grid.onViewportChanged.subscribe(viewPortChange);
			
			//adds sort functionality
			grid.onSort.subscribe(function(e,a){
				model.setSort(a.sortCol.field,a.sortAsc);
				viewPortChange();
			});
			
			//saves columns
			var saveColumns = function(){
				var columns=[$.extend({order:opts.saveColumns.order,size:opts.saveColumns.size},opts.saveColumns.params)];
				for(var column in grid.getColumns()){
					columns.push({field: column.field, width: column.width});
				}
				$.post(opts.saveColumns.url,columns,function(d){onSave(d);});
			}
			
			if(opts.saveColumns.order){
				grid.onColumnsReordered.subscribe(saveColumns);
			}
			if(opts.saveColumns.size){
				grid.onColumnsResized.subscribe(saveColumns);
			}

			//events
			var clickEventTimer;
			grid.onClick.subscribe(function(e,a){
				if(clickEventTimer){
					clearTimeout(clickEventTimer);
					clickEventTimer=null;
					opts.onDblClick(a);
				}else{
					clickEventTimer = setTimeout(function(){
						clickEventTimer=null;
						opts.onClick(a);
					}, 250);
				}
			});
			//grid.onDblClick.subscribe(function(e,a){opts.onDblClick(a);});
			grid.onContextMenu.subscribe(function(e,a){opts.onRightClick(a);});
			
			//resize grid when window is changed (incase grid size was changed)
			$(window).resize(function(){grid.resizeCanvas()});
			
			grid.onViewportChanged.notify();
		});

		//make sure the grid has all the data from what is in-view
		var viewPortChange = function(){
			var viewPort=grid.getViewport();
			model.ensureData(viewPort.top,viewPort.bottom);
		}
		
		//the init call (used for reload also)
		var init = function(){
			if(grid != false){
				grid.destroy();
				model.clear();
				model.reloadColumns();
			}
			model.ensureData(0,10);
		}
		
		//initialize the first ajax call
		init();
		
		//returned variables
		return {
			grid: grid,
			model: model,
			search: function(text){
				model.setSearch(text);
				viewPortChange();
			},
			reload: init,
			destroy: function(){
				grid.destroy();
				model.clear();
			},
			setParam: function(param,value){
				model.setParam(param,value);
			},
			setView: function(view){
				model.setParam('view',view);
				viewPortChange();
			}
		}
	}

	/**
	 * AJAX to Url,
	 * Return:
	 * 		same as above (AjaxModel, and SingleGrid) but add
	 * 		id must be added to every column on the top grid (the id gets passed to the bottom grid so you can search for stuff)
	 * Addional params:
	 * 		model:	top | bottom
	 * 		view:	(used if user defines a view, otherwise unassigned)
	 * 		id:		(only used for bottom grid, gives you the id of the top grid click)
	 */
	function TwoGrid(opts){
		var _row = false;
		var onClick = function(a){
			a=a.row;
			var model=top.model;
			if(model.isDataLoaded(a,a)){
				loadBottomGrid(model.data[a].id);
			}
		}

		opts = $.extend(true, {
			url: '',
			top: '#tg',
			bottom: '#bg',
			topGrid:{},
			bottomGrid:{},
			saveColumns:'url',//false or url to post to
			topRightClick: function(){},
			topDblClick: onClick,
			bottomRightClick: function(){},
			bottomDblClick: function(){}
		},opts);
		
		
		var loadBottomGrid = function(id){
			if(bottom!=false){
				if(_row!=id){
					_row = id;
					bottom.setParam('id',id);
					bottom.reload();
				}
			}else{
				_row = id;
				var ajax = $.extend(true,{},_ajax);
				ajax.params.id = id;
				ajax.params.model = 'bottom';
				if(_view != false){
					ajax.params.view = _view;
				}
				bottom = new SingleGrid(opts.bottom, {
					ajax: ajax,
					saveColumns: _saveColumns,
					grid: opts.bottomGrid,
					onRightClick: opts.bottomRightClick,
					onDblClick: opts.bottomDblClick
				});
			}
		}
		
		var _view = false;
		var _ajax = {url:opts.url,params:{model:'top'}};
		var _saveColumns = (opts.saveColumns!=false);
		_saveColumns = {size: _saveColumns, order: _saveColumns, url: opts.saveColumns};
		
		var top = new SingleGrid(opts.top, {
			ajax: _ajax,
			saveColumns: _saveColumns,
			grid: opts.topGrid,
			onRightClick: opts.topRightClick,
			onClick: onClick,
			onDblClick: opts.topDblClick
		});
		var bottom=false;
		
		
		return {
			top: top,
			bottom: bottom,
			loadBottomGrid: loadBottomGrid,
			setBottomView: function(view){
				if(bottom != false){
					bottom.setView(view);
				}
				_view = view;
			},
			setTopView: function(view){
				top.setView(view);
			}
		}
	}
	
	$.extend(true, window, { Slick: { KJL: { AjaxModel: AjaxModel, RowSelectionModel:RowSelectionModel, SingleGrid: SingleGrid, TwoGrid: TwoGrid }}});
})(jQuery);