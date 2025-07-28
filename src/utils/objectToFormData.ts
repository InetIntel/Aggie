export default function objectToFormData(obj: any, form: FormData = new FormData(), prefix: string = ''): FormData {
  for (let key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    const value = obj[key];
    if (!value) continue;

    const formKey = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((element, index) => {
        if (element instanceof File || element instanceof Blob) {
          form.append(formKey, element);
        } else if (typeof element === 'object' && element !== null) {
          objectToFormData(element, form, formKey);
        } else {
          form.append(formKey, element);
        }
      });
    } else if (value instanceof File || value instanceof Blob) {
      form.append(formKey, value);
    } else if (typeof value === 'object' && value !== null) {
      objectToFormData(value, form, formKey);
    } else if (typeof value !== 'undefined') {
      form.append(formKey, value);
    }
  }

  return form;
}
