/* exported getNextSelectedItem getNearestItemFromOrigin */

const Gdk = imports.gi.Gdk;

function getCompareFunc(direction) {
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

function getDistance(x1, x2, y1, y2) {
    let distanceX = x1 - x2;
    let distanceY = y1 - y2;
    return distanceX ** 2 + distanceY ** 2;
}

function getNextSelectedItem(pivot, fileList, direction) {
    let [x1, y1, endX1_, endY1_, grid_] = pivot.getCoordinates();
    let minimumDistance = Number.MAX_VALUE;
    let itemIndex = -1;

    let compareFunc = getCompareFunc(direction);

    for (let i = 0; i < fileList.length; i++) {
        let [x2, y2, endX2_, endY2_, grid2_] = fileList[i].getCoordinates();
        if (!compareFunc(x1, x2, y1, y2))
            continue;


        let distance = getDistance(x1, x2, y1, y2);
        if (distance > minimumDistance)
            continue;


        minimumDistance = distance;
        itemIndex = i;
    }
    return itemIndex;
}

function getNearestItemFromOrigin(fileList) {
    let minimumDistance = Number.MAX_VALUE;
    let itemIndex = -1;

    for (let i = 0; i < fileList.length; i++) {
        let [x, y, endX_, endY_, grid_] = fileList[i].getCoordinates();
        let distance = getDistance(0, x, 0, y);
        if (distance > minimumDistance)
            continue;


        minimumDistance = distance;
        itemIndex = i;
    }
    return itemIndex;
}
