import React, { useEffect, useState } from 'react';
import common from '../common';

const PrecisionInput = props => {
  const [value, setValue] = useState(
    props.value != '' ? common.pricisionFormat_Precision(props.defaultValue ?? props.value, props.precision ?? '2') : ''
  );
  const onChange = ({ target: { value } }) => {
    if (props.onChange) {
      props.onChange(value);
    }
    setValue(value);
  };

  const onFocus = () => {
    setValue(common.removeComma(value));
  };

  const onBlur = () => {
    if (props.onBlur) {
      props.onBlur(value);
    }
    setValue(common.pricisionFormat_Precision(value, props.precision ?? '2'));
  };

  useEffect(() => {
    setValue(props.value ? common.pricisionFormat_Precision(props.value, props.precision ?? '2') : '');
  }, [props.value]);

  return (
    <input
      type={props.type}
      id={props.id}
      name={props.name}
      className={props.className}
      placeholder={props.placeholder}
      disabled={props.disabled ? true : false}
      minLength={props.minLength}
      maxLength={props.maxLength}
      required
      autoComplete={props.autoComplete}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={onChange}
      value={value}
      readOnly={props.readOnly}
    />
  );
};

export default PrecisionInput;
