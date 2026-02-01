class Counter {
  private _value: number;

  constructor(value: number = 0) {
    this._value = value;
  }

  current() {
    return this._value;
  }

  next() {
    this._value += 1;

    return this._value;
  }
}

export default Counter;
