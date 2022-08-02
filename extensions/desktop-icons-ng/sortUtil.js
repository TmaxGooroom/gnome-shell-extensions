/* exported compareValue */
const Enums = imports.enums;

function compareValue(item1, item2, criteria) {
    if (item1.isSystemFolder)
        return 1;


    if (item2.isSystemFolder)
        return 0;


    let ret;
    switch (criteria) {
    case Enums.SortingCriteria.Name:
        // NOTE : The ascending order should be as follow
        // 1. Special characters (punctuation, unicode except Korean)
        // 2. Number (0~9)
        // 3. Uppercase alphabet (A~Z)
        // 4. Lowercase alphabet (a~z)
        // 5. Korean (가~)
        ret = item1.displayName > item2.displayName;
        break;

    case Enums.SortingCriteria.Size:
        ret = item1.fileSize > item2.fileSize;
        break;

    case Enums.SortingCriteria.Type:
        ret = item1.contentType > item2.contentType;
        break;

    case Enums.SortingCriteria.Time:
        ret = item1.modifiedTime > item2.modifiedTime;
        break;
    }

    return ret;
}
