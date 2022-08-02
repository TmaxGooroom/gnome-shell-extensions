/*
 * ArcMenu - A traditional application menu for GNOME 3
 *
 * ArcMenu Lead Developer and Maintainer
 * Andrew Zaech https://gitlab.com/AndrewZaech
 *
 * ArcMenu Founder, Former Maintainer, and Former Graphic Designer
 * LinxGem33 https://gitlab.com/LinxGem33 - (No Longer Active)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Constants = Me.imports.constants;
const {Gio, GLib} = imports.gi;

function getCategoryDetails(currentCategory){
    let name, gicon, iconName, fallbackIconName;
    let categoryMatchFound = false;
    for(let entry of Constants.CATEGORIES){
        if(entry.Category === currentCategory){
            categoryMatchFound = true;
            name = entry.Name;
            if(entry.Icon.startsWith(Me.path))
                gicon = Gio.icon_new_for_string(entry.Icon);
            else
                iconName = entry.Icon;
            return [name, gicon, iconName, fallbackIconName];
        }
    }
    if(currentCategory === Constants.CategoryType.HOME_SCREEN){
        name = _("Home Screen");
        gicon = Gio.icon_new_for_string(Me.path + '/media/icons/menu_icons/homescreen-symbolic.svg');
        return [name, gicon, iconName, fallbackIconName];
    }
    else if(!categoryMatchFound){
        name = currentCategory.get_name();
        gicon = currentCategory.get_icon() ? currentCategory.get_icon() : null;
        fallbackIconName = currentCategory.get_icon() ? currentCategory.get_icon().to_string() : null;
        return [name, gicon, iconName, fallbackIconName];
    }
}

function getMenuButtonIcon(){
    let path = Me.path + Constants.MENU_BUTTON_ICONS_PATH;
    if(GLib.file_test(path, GLib.FileTest.IS_REGULAR))
        return path;

    global.log("ArcMenu - Menu Button Icon Error! Set to System Default.");
    return 'start-here-symbolic';
}

function setGridLayoutStyle(actor, box){
    actor.style = "width: 80px; height: 80px; background-color:rgb(255, 255, 0);"
    actor.style += "text-align: center; border-radius: 4px; padding: 5px; spacing: 0px";
    box.style = "padding: 0px; margin: 0px; spacing: 0px;";
}

function findSoftwareManager(){
    let softwareManager = null;
    let appSys = imports.gi.Shell.AppSystem.get_default();

    for(let softwareManagerID of Constants.SoftwareManagerIDs){
        if(appSys.lookup_app(softwareManagerID)){
            softwareManager = softwareManagerID;
            break;
        }
    }

    return softwareManager;
}

var ScrollViewShader = `uniform sampler2D tex;
uniform float height;
uniform float width;
uniform float vfade_offset;
uniform float hfade_offset;
uniform bool  fade_edges_top;
uniform bool  fade_edges_right;
uniform bool  fade_edges_bottom;
uniform bool  fade_edges_left;

uniform vec2 fade_area_topleft;
uniform vec2 fade_area_bottomright;

void main ()
{
    cogl_color_out = cogl_color_in * texture2D (tex, vec2 (cogl_tex_coord_in[0].xy));

    float y = height * cogl_tex_coord_in[0].y;
    float x = width * cogl_tex_coord_in[0].x;

    if (x > fade_area_topleft[0] && x < fade_area_bottomright[0] &&
        y > fade_area_topleft[1] && y < fade_area_bottomright[1]) {
        float ratio = 1.0;
        float fade_bottom_start = fade_area_bottomright[1] - vfade_offset;
        float fade_right_start = fade_area_bottomright[0] - hfade_offset;
        bool fade_top = y < vfade_offset && fade_edges_top;
        bool fade_bottom = y > fade_bottom_start && fade_edges_bottom;
        bool fade_left = x < hfade_offset && fade_edges_left;
        bool fade_right = x > fade_right_start && fade_edges_right;

        float vfade_scale = height / vfade_offset;
        if (fade_top) {
            ratio *= y / vfade_offset;
        }

        if (fade_bottom) {
            ratio *= (fade_area_bottomright[1] - y) / (fade_area_bottomright[1] - fade_bottom_start);
        }

        float hfade_scale = width / hfade_offset;
        if (fade_left) {
            ratio *= x / hfade_offset;
        }

        if (fade_right) {
            ratio *= (fade_area_bottomright[0] - x) / (fade_area_bottomright[0] - fade_right_start);
        }

        cogl_color_out *= ratio;
    }
}`;

function createXpmImage(color1, color2, color3, color4){
    let width = 42;
    let height = 14;
    let colors = 5;
    let xpm = [width + " " + height + " " + colors + " " + 1, "1 c " + rgbStringToHex(color1), "2 c " + rgbStringToHex(color2),
                "3 c " + rgbStringToHex(color3), "4 c " + rgbStringToHex(color4), "x c #AAAAAA"];
    xpm.push("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    for(let i = 0; i < height - 2; i++)
        xpm.push("x1111111111222222222233333333334444444444x");
    xpm.push("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    return xpm;
}

function ensureActorVisibleInScrollView(actor) {
    let box = actor.get_allocation_box();
    let y1 = box.y1, y2 = box.y2;

    let parent = actor.get_parent();
    while (!(parent instanceof imports.gi.St.ScrollView)) {
        if (!parent)
            return;

        box = parent.get_allocation_box();
        y1 += box.y1;
        y2 += box.y1;
        parent = parent.get_parent();
    }

    let adjustment = parent.vscroll.adjustment;
    let [value, lower_, upper, stepIncrement_, pageIncrement_, pageSize] = adjustment.get_values();

    let offset = 0;
    let vfade = parent.get_effect("fade");
    if (vfade)
        offset = vfade.vfade_offset;

    if (y1 < value + offset)
        value = Math.max(0, y1 - offset);
    else if (y2 > value + pageSize - offset)
        value = Math.min(upper, y2 + offset - pageSize);
    else
        return;

    adjustment.set_value(value);
}

function getArraysEqual(a, b) {
    if(a instanceof Array && b instanceof Array){
        if (a.length !== b.length)
            return false;
        for(let i = 0; i < a.length; i++)
            if (!getArraysEqual(a[i], b[i]))
                return false;
        return true;
    }
    else
        return a === b;
}

function createTooltip(button, widget, titleLabel, description){
    let lbl = titleLabel.clutter_text;
    lbl.get_allocation_box();
    let isEllipsized = lbl.get_layout().is_ellipsized();
    if(isEllipsized || description){
        let titleText, descriptionText;
        if(isEllipsized && description){
            titleText = titleLabel.text.replace(/\n/g, " ");
            descriptionText = description;
        }
        else if(isEllipsized && !description)
            titleText = titleLabel.text.replace(/\n/g, " ");
        else if(!isEllipsized && description)
            descriptionText = description;
        widget.tooltip = new Me.imports.menuWidgets.Tooltip(button, widget.actor, titleText, descriptionText);
        widget.tooltip._onHover();
    }
}

function getDashToPanelPosition(settings, index){
    var positions = null;
    var side;

    try{
        positions = JSON.parse(settings.get_string('panel-positions'))
    } catch(e){
        log('Error parsing Dash to Panel positions: ' + e.message);
    }

    if(!positions)
        side = settings.get_string('panel-position');
    else{
        side = positions[index];
    }

    if (side === 'TOP')
        return imports.gi.St.Side.TOP;
    else if (side === 'RIGHT')
        return imports.gi.St.Side.RIGHT;
    else if (side === 'BOTTOM')
        return imports.gi.St.Side.BOTTOM;
    else if (side === 'LEFT')
        return imports.gi.St.Side.LEFT;
    else
        return imports.gi.St.Side.TOP;
}

function getStylesheet(){
    let stylesheet = Gio.File.new_for_path(GLib.get_home_dir() + "/.local/share/arcmenu/stylesheet.css");

    if(!stylesheet.query_exists(null)){
        GLib.spawn_command_line_sync("mkdir " + GLib.get_home_dir() + "/.local/share/arcmenu");
        GLib.spawn_command_line_sync("touch " + GLib.get_home_dir() + "/.local/share/arcmenu/stylesheet.css");
        stylesheet = Gio.File.new_for_path(GLib.get_home_dir() + "/.local/share/arcmenu/stylesheet.css");
    }

    return stylesheet;
}

function rgbStringToHex(colorString) {
    let [r, g, b, a_] = parseRgbString(colorString)
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function parseRgbString(colorString){
    if(colorString.includes('rgba'))
		colorString = colorString.replace('rgba(','');
	if(colorString.includes('rgb'))
		colorString = colorString.replace('rgb(','');
	colorString = colorString.replace(')','');
    let rgbaColor = colorString.split(",");

    let r = parseFloat(rgbaColor[0]);
    let g = parseFloat(rgbaColor[1]);
    let b = parseFloat(rgbaColor[2]);
	let a;
	if(rgbaColor[3] != undefined)
		a = parseFloat(rgbaColor[3]);
	else
        a = 1;
    return [r, g, b, a];
}

function modifyColorLuminance(colorString, luminanceFactor, modifyAlpha){
    let Clutter = imports.gi.Clutter;
    let color = Clutter.color_from_string(colorString)[1];
    let [hue, lum, sat] = color.to_hls();
    let modifiedLum = lum;

    if(luminanceFactor >= 0)
        modifiedLum += luminanceFactor;
    else
        modifiedLum -= Math.abs(luminanceFactor);

    //Reverse the darken/lighten effect if luminance out of range
    if(modifiedLum >= 1 || modifiedLum < 0){
        modifiedLum = lum;
        if(luminanceFactor < 0)
            modifiedLum += Math.abs(luminanceFactor);
        else
            modifiedLum -= luminanceFactor;
    }

    let alpha = Math.round((color.alpha / 255) * 100) / 100;
    if(modifyAlpha){
        alpha = Math.round((color.alpha / 255) * 100) / 100;
        alpha = alpha * (1 - modifyAlpha);
    }

    let modifiedColor = Clutter.color_from_hls(hue, modifiedLum, sat);

    return "rgba("+modifiedColor.red+","+modifiedColor.green+","+modifiedColor.blue+","+alpha+")";
}
