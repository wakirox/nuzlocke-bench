export const Type_XY = 0;
export const Type_ORAS = 1;
export const Type_SM = 2;
export const Type_USUM = 3;

const textVariableCodesXY: Map<number, string> = setupTextVariableCodes(Type_XY);
const textVariableCodesORAS: Map<number, string> = setupTextVariableCodes(Type_ORAS);
const textVariableCodesSM: Map<number, string> = setupTextVariableCodes(Type_SM);

export function getTextVariableCodes(romType: number): Map<number, string> {
    if (romType == Type_XY) {
        return textVariableCodesXY;
    } else if (romType == Type_ORAS) {
        return textVariableCodesORAS;
    } else if (romType == Type_SM || romType == Type_USUM) {
        return textVariableCodesSM;
    }
    return new Map();
}

function setupTextVariableCodes(romType: number): Map<number, string> {
    const map = new Map<number, string>();

    if (romType == Type_XY) {
        map.set(0xFF00, "COLOR");
        map.set(0x0100, "TRNAME");
        map.set(0x0101, "PKNAME");
        map.set(0x0102, "PKNICK");
        map.set(0x0103, "TYPE");
        map.set(0x0105, "LOCATION");
        map.set(0x0106, "ABILITY");
        map.set(0x0107, "MOVE");
        map.set(0x0108, "ITEM1");
        map.set(0x0109, "ITEM2");
        map.set(0x010A, "sTRBAG");
        map.set(0x010B, "BOX");
        map.set(0x010D, "EVSTAT");
        map.set(0x0110, "OPOWER");
        map.set(0x0127, "RIBBON");
        map.set(0x0134, "MIINAME");
        map.set(0x013E, "WEATHER");
        map.set(0x0189, "TRNICK");
        map.set(0x018A, "1stchrTR");
        map.set(0x018B, "SHOUTOUT");
        map.set(0x018E, "BERRY");
        map.set(0x018F, "REMFEEL");
        map.set(0x0190, "REMQUAL");
        map.set(0x0191, "WEBSITE");
        map.set(0x019C, "CHOICECOS");
        map.set(0x01A1, "GSYNCID");
        map.set(0x0192, "PRVIDSAY");
        map.set(0x0193, "BTLTEST");
        map.set(0x0195, "GENLOC");
        map.set(0x0199, "CHOICEFOOD");
        map.set(0x019A, "HOTELITEM");
        map.set(0x019B, "TAXISTOP");
        map.set(0x019F, "MAISTITLE");
        map.set(0x1000, "ITEMPLUR0");
        map.set(0x1001, "ITEMPLUR1");
        map.set(0x1100, "GENDBR");
        map.set(0x1101, "NUMBRNCH");
        map.set(0x1302, "iCOLOR2");
        map.set(0x1303, "iCOLOR3");
        map.set(0x0200, "NUM1");
        map.set(0x0201, "NUM2");
        map.set(0x0202, "NUM3");
        map.set(0x0203, "NUM4");
        map.set(0x0204, "NUM5");
        map.set(0x0205, "NUM6");
        map.set(0x0206, "NUM7");
        map.set(0x0207, "NUM8");
        map.set(0x0208, "NUM9");
    } else if (romType == Type_ORAS) {
        map.set(0xFF00, "COLOR");
        map.set(0x0100, "TRNAME");
        map.set(0x0101, "PKNAME");
        map.set(0x0102, "PKNICK");
        map.set(0x0103, "TYPE");
        map.set(0x0105, "LOCATION");
        map.set(0x0106, "ABILITY");
        map.set(0x0107, "MOVE");
        map.set(0x0108, "ITEM1");
        map.set(0x0109, "ITEM2");
        map.set(0x010A, "sTRBAG");
        map.set(0x010B, "BOX");
        map.set(0x010D, "EVSTAT");
        map.set(0x0110, "OPOWER");
        map.set(0x0127, "RIBBON");
        map.set(0x0134, "MIINAME");
        map.set(0x013E, "WEATHER");
        map.set(0x0189, "TRNICK");
        map.set(0x018A, "1stchrTR");
        map.set(0x018B, "SHOUTOUT");
        map.set(0x018E, "BERRY");
        map.set(0x018F, "REMFEEL");
        map.set(0x0190, "REMQUAL");
        map.set(0x0191, "WEBSITE");
        map.set(0x019C, "CHOICECOS");
        map.set(0x01A1, "GSYNCID");
        map.set(0x0192, "PRVIDSAY");
        map.set(0x0193, "BTLTEST");
        map.set(0x0195, "GENLOC");
        map.set(0x0199, "CHOICEFOOD");
        map.set(0x019A, "HOTELITEM");
        map.set(0x019B, "TAXISTOP");
        map.set(0x019F, "MAISTITLE");
        map.set(0x1000, "ITEMPLUR0");
        map.set(0x1001, "ITEMPLUR1");
        map.set(0x1100, "GENDBR");
        map.set(0x1101, "NUMBRNCH");
        map.set(0x1302, "iCOLOR2");
        map.set(0x1303, "iCOLOR3");
        map.set(0x0200, "NUM1");
        map.set(0x0201, "NUM2");
        map.set(0x0202, "NUM3");
        map.set(0x0203, "NUM4");
        map.set(0x0204, "NUM5");
        map.set(0x0205, "NUM6");
        map.set(0x0206, "NUM7");
        map.set(0x0207, "NUM8");
        map.set(0x0208, "NUM9");
    } else if (romType == Type_SM) {
        map.set(0xFF00, "COLOR");
        map.set(0x0100, "TRNAME");
        map.set(0x0101, "PKNAME");
        map.set(0x0102, "PKNICK");
        map.set(0x0103, "TYPE");
        map.set(0x0105, "LOCATION");
        map.set(0x0106, "ABILITY");
        map.set(0x0107, "MOVE");
        map.set(0x0108, "ITEM1");
        map.set(0x0109, "ITEM2");
        map.set(0x010A, "sTRBAG");
        map.set(0x010B, "BOX");
        map.set(0x010D, "EVSTAT");
        map.set(0x0110, "OPOWER");
        map.set(0x0127, "RIBBON");
        map.set(0x0134, "MIINAME");
        map.set(0x013E, "WEATHER");
        map.set(0x0189, "TRNICK");
        map.set(0x018A, "1stchrTR");
        map.set(0x018B, "SHOUTOUT");
        map.set(0x018E, "BERRY");
        map.set(0x018F, "REMFEEL");
        map.set(0x0190, "REMQUAL");
        map.set(0x0191, "WEBSITE");
        map.set(0x019C, "CHOICECOS");
        map.set(0x01A1, "GSYNCID");
        map.set(0x0192, "PRVIDSAY");
        map.set(0x0193, "BTLTEST");
        map.set(0x0195, "GENLOC");
        map.set(0x0199, "CHOICEFOOD");
        map.set(0x019A, "HOTELITEM");
        map.set(0x019B, "TAXISTOP");
        map.set(0x019F, "MAISTITLE");
        map.set(0x1000, "ITEMPLUR0");
        map.set(0x1001, "ITEMPLUR1");
        map.set(0x1100, "GENDBR");
        map.set(0x1101, "NUMBRNCH");
        map.set(0x1302, "iCOLOR2");
        map.set(0x1303, "iCOLOR3");
        map.set(0x0200, "NUM1");
        map.set(0x0201, "NUM2");
        map.set(0x0202, "NUM3");
        map.set(0x0203, "NUM4");
        map.set(0x0204, "NUM5");
        map.set(0x0205, "NUM6");
        map.set(0x0206, "NUM7");
        map.set(0x0207, "NUM8");
        map.set(0x0208, "NUM9");
    }
    return map;
}

export function getVariableCode(name: string, romType: number): number {
    const map = getTextVariableCodes(romType);
    for (const [k, v] of map) {
        if (v === name) {
            return k;
        }
    }
    return 0;
}
