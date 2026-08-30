export type ClassValue = ClassArray | ClassDictionary | string | number | null | boolean | undefined;
export type ClassDictionary = Record<string, any>;
export type ClassArray = ClassValue[];

function toVal(mix: ClassValue): string {
  let k, y, str = '';
  if (typeof mix === 'string' || typeof mix === 'number') {
    str += mix;
  } else if (typeof mix === 'object' && mix !== null) {
    if (Array.isArray(mix)) {
      const len = mix.length;
      for (k = 0; k < len; k++) {
        if (mix[k]) {
          if ((y = toVal(mix[k]))) {
            if (str) str += ' ';
            str += y;
          }
        }
      }
    } else {
      for (const key in mix) {
        if (mix[key]) {
          if (str) str += ' ';
          str += key;
        }
      }
    }
  }
  return str;
}

export function clsx(...inputs: ClassValue[]): string {
  let i = 0, tmp, str = '', len = inputs.length;
  for (; i < len; i++) {
    if ((tmp = inputs[i])) {
      if ((tmp = toVal(tmp))) {
        if (str) str += ' ';
        str += tmp;
      }
    }
  }
  return str;
}

export function twMerge(...classLists: ClassValue[]): string {
  return clsx(...classLists);
}

export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
