;(function($) {
    
    var
    
    defaults = {
        origin: $('body'),              //the element that the current selection should be positioned relative to
        position: { x: 'r', y: 'b' },   //user should specify like css, i.e. 'right bottom'
        preventOffScreen: false,        //prevent the bubble from being obstructed by the edges of the viewport
        relative: false,                //calculate the position relative to the offset parent rather than the document
        positionAdjust: {               //how to adjust the bubble position when preventOffScreen == true; user should specify like css
            t: { y: 'b' },                  // '? bottom'
            r: { x: 'l' },                  // 'left ?'
            b: { y: 't' },                  // '? top'
            l: { x: 'r' }                   // 'right ?'
        },
        baseCSS: {                      //any CSS that should be merged in with the top and left declarations
            'position': 'absolute'
        }
    },
    
    settings = {},
    
    //position classes
    positionClasses = {
        x: {
            r: 'right',
            l: 'left',
            c: 'hCenter',
            cl: 'hCenterLeft',
            cr: 'hCenterRight'
        },
        y: {
            t: 'top',
            b: 'bottom',
            c: 'vCenter',
            ct: 'vCenterTop',
            cb: 'vCenterBottom'
        }
    },
    
    //allowed positions
    validPositions = {
        center: /^(c|m)$/,
        x: /^(l|cl|c|cr|r)$/,
        y: /^(t|ct|c|cb|b)$/
    },
    
    allPositionClassesString = null,
    
    getAllPositionClassesString = function() {
        if (!allPositionClassesString) {
            var arr = [];
            
            $.each(positionClasses, function(key, value) {
                $.each(value, function(k, v) {
                    arr.push(v);
                });
            });
            
            allPositionClassesString = arr.join(' ');
        }
        
        return allPositionClassesString;
    },
    
    getPositionClassesString = function(pos) {
        var arr = [];
        
        $.each(positionClasses, function(key, value) {
            arr.push(value[pos[key]]);
        });
        
        return arr.join(' ');
    },
    
    //retrieve the second piece of the position
    getSubPosition = function(str) {
        var subpos = '';

        if (str.indexOf('-') > -1) {
            var split = str.split('-');
            subpos = split[1].charAt(0).toLowerCase();
        }

        return subpos;
    },
    
    //get a position object
    getPositionObject = function(position) {
        //split into x and y components
        var pos = position.split(" "),
            x = pos[0].charAt(0).toLowerCase(),
            y = pos[1].charAt(0).toLowerCase(),
            obj = {};
            
        //normalize the value and get the subposition
        if (validPositions.center.test(x)) {
            x = 'c' + getSubPosition(pos[0]);
        }

        //normalize the value and get the subposition
        if (validPositions.center.test(y)) {
            y = 'c' + getSubPosition(pos[1]);
        }

        if (validPositions.x.test(x)) {
            obj.x = x;
        }

        if (validPositions.y.test(y)) {
            obj.y = y;
        }

        return obj;
    },
    
    //calculate the position of the bubble
    calculatePosition = function(elem, target, position) {
        var method = settings.relative ?  'position' : 'offset',
            coords = target[method](),
            pos = { //find target element's sides relative to the document or offset parent, depending on settings.relative
                t: coords.top,
                l: coords.left,
                b: coords.top + target.outerHeight(),
                r: coords.left + target.outerWidth()
            },
            top = pos.b,
            left = pos.r,
            height = elem.outerHeight(),
            width = elem.outerWidth(),
            css = {};

        //vertical position
        switch (position.y) {
            case 't': //align to top of target
                top = pos.t - height;
                break;
            case 'ct': // align top of bubble to top of target
                top = pos.t;
                break;
            case 'c': //align to center of target
                top = pos.t + ((pos.b - pos.t)/2) - (height/2);
                break;
            case 'cb': //align bottom of bubble to bottom of target
                top = pos.b - height;
                break;
            case 'b': //align to bottom of target
            default:
                //nothing to do, already set
                break;
        }

        //horizontal position
        switch (position.x) {
            case 'l': //align to left of target
                left = pos.l - width;
                break;
            case 'cl': //align left of bubble to left of target
                left = pos.l;
                break;
            case 'c': //align to center of target
                left = pos.l + ((pos.r - pos.l)/2) - (width/2);
                break;
            case 'cr': //align right of bubble to right of target
                left = pos.r - width;
                break;
            case 'r': //align to right of target
            default:
                //nothing to do, already set
                break;
        }

        return { 'top': top, 'left': left };
    },
    
    //find any edges of the bubble outside the viewport
    isEdgeOffscreen = function(elem, css) {
        var out = [],
            w = $(window),
            width = elem.outerWidth(true),
            height = elem.outerHeight(true),
            vp = { //viewport
                t: w.scrollTop(),
                l: w.scrollLeft(),
                b: w.scrollTop() + w.height(),
                r: w.scrollLeft() + w.width()
            },
            eDim = { //elem dimensions
                t: css.top,
                l: css.left,
                b: css.top + height,
                r: css.left + width
            };

        for (var edge in vp) {
            if (edge == 't' || edge == 'l') {
                if (vp[edge] > eDim[edge])
                    out.push(edge);
            } else {
                if (eDim[edge] > vp[edge])
                    out.push(edge);
            }
        }

        return out.length > 0 ? out : false;
    },
    
    //adjust the position of the bubble
    getAdjustedPosition = function(elem, css, adj) {
        var overlap = isEdgeOffscreen(elem, css),
            newpos = {};

        if (overlap === false) { //no overlapping edges
            return false;
        }

        //merge the adjustments into a new position
        for (var edge in overlap) {
            newpos = $.extend(newpos, adj[overlap[edge]]);
        }

        return newpos;
    };
    
    
    $.fn.locus = function(options) {
        $.extend(true, settings, defaults, options || {});
        
        if (!$.isPlainObject(settings.position)) {
            settings.position = getPositionObject(settings.position);
        }
        
        if (settings.preventOffScreen) {
            $.each(settings.positionAdjust, function(key, value) {
                if (!$.isPlainObject(value)) {
                    settings.positionAdjust[key] = getPositionObject(value);
                }
            });
        }
        
        return this.each(function() {
            var
            self = $(this),
            pos = $.extend({}, settings.position),
            css = calculatePosition(self, settings.origin, pos);
            
            if (settings.preventOffScreen && (newpos = getAdjustedPosition(self, css, settings.positionAdjust))) {
                $.extend(pos, newpos);
                css = calculatePosition(self, settings.origin, pos);
            }
            
            $.extend(css, settings.baseCSS);
            
            self.removeClass(getAllPositionClassesString()).addClass(getPositionClassesString(pos)).css(css);
        });
    }
    
})(jQuery);