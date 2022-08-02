/* exported SelectionCalculator */

const Gdk = imports.gi.Gdk;

var SelectionCalculator = class SelectionCalculator {
    constructor() {
        this._pivotToShiftSelection = null;
    }

    _getCompareFunc(direction) {
        if (direction === Gdk.KEY_Up) {
            return (unusedX1, unusedX2, y1, y2) => {
                return y2 < y1;
            };
        } else if (direction === Gdk.KEY_Down)  {
            return (unusedX1, unusedX2, y1, y2) => {
                return y2 > y1;
            };
        }  else if (direction === Gdk.KEY_Right) {
            return (x1, x2, unusedY1, unusedY2) => {
                return x2 > x1;
            };
        } else {
            return (x1, x2, unusedY1, unusedY2) => {
                return x2 < x1;
            };
        }
    }

    _getDistance(x1, x2, y1, y2) {
        let distanceX = x1 - x2;
        let distanceY = y1 - y2;
        return Math.hypot(distanceX, distanceY);
    }

    _getNearestItemFromOrigin(fileList) {
        let nearestItem = [];
        let minimumDistance = Number.MAX_VALUE;
        let itemIndex = -1;

        for (let i = 0; i < fileList.length; i++) {
            let [x, y, endX_, endY_, grid_] = fileList[i].getCoordinates();
            let distance = this._getDistance(0, x, 0, y);
            if (distance > minimumDistance)
                continue;

            minimumDistance = distance;
            itemIndex = i;
        }

        if (itemIndex === -1)
            return nearestItem;


        this._pivotToShiftSelection = fileList[itemIndex];
        nearestItem.push(fileList[itemIndex]);
        return nearestItem;
    }

    getNextSelection(selectedItems, fileList, direction) {
        let itemIndex = -1;
        let nextSelection = [];
        let focusedItem = fileList.find(item => item.actor.has_focus === true);

        if (!this._pivotToShiftSelection) {
            // set focused item as pivot for shift selection when it's null
            this._pivotToShiftSelection = focusedItem;
        } else if (selectedItems && selectedItems.length === 1) {
        // set focused item as pivot for shift selection when the number of selected item
        // is only one. Otherwise, keep the pivot because shift selection maybe in progress
            this._pivotToShiftSelection = focusedItem;
        }

        if (!focusedItem) {
            // If no focused one, then choose nearest one from origin
            return this._getNearestItemFromOrigin(fileList);
        }

        let compareFunc = this._getCompareFunc(direction);
        let [x1, y1, endX1_, endY1_, grid_] = focusedItem.getCoordinates();
        let minimumDistance = Number.MAX_VALUE;

        for (let i = 0; i < fileList.length; i++) {
            let [x2, y2, endX2_, endY2_, grid2_] = fileList[i].getCoordinates();
            if (!compareFunc(x1, x2, y1, y2))
                continue;

            let distance = this._getDistance(x1, x2, y1, y2);
            if (distance > minimumDistance)
                continue;

            minimumDistance = distance;
            itemIndex = i;
        }

        if (itemIndex === -1)
            return nextSelection;


        nextSelection.push(fileList[itemIndex]);

        return nextSelection;
    }

    getShiftSelectedButtons(fileList, toItem) {
        let selectedFiles = [];
        if (!this._pivotToShiftSelection) {
            log('no pivot to select in range');
            return selectedFiles;
        }

        let [x1, y1, endX1_, endY1_, grid1_] = this._pivotToShiftSelection.getCoordinates();
        let [x2, y2, endX2_, endY2_, grid2_] = toItem.getCoordinates();

        let start = [], end = [];
        if (x1 === x2) {
            start = y1 > y2 ? [x2, y2] : [x1, y1];
            end = y1 > y2 ? [x1, y1] : [x2, y2];
        } else {
            start = x1 > x2 ? [x2, y2] : [x1, y1];
            end = x1 > x2 ? [x1, y1] : [x2, y2];
        }

        for (let fileItem of fileList) {
            let [x, y, endX_, endY_, grid_] = fileItem.getCoordinates();
            if (x < start[0] || end[0] < x) {
                // exclude other row item
                continue;
            }

            if (start[0] === x && y < start[1]) {
                // exclude same row, but column is before start
                continue;
            }

            if (x === end[0] && end[1] < y) {
                // exclude same row, but column is after end
                continue;
            }

            selectedFiles.push(fileItem);
        }

        return selectedFiles;
    }

    resetPivot() {
        this._pivotToShiftSelection = null;
    }
};
