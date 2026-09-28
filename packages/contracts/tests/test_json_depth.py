"""QA-14: malformed data must not crash validation or rendering its error."""

import pytest
from jsonschema import ValidationError

from packages.contracts import validation as v1
from packages.contracts.process_v2 import validation as v2


@pytest.mark.parametrize("module", [v1, v2])
@pytest.mark.parametrize("container", [list, tuple])
@pytest.mark.parametrize("depth", [400, 20000, 52000])
def test_deep_malformed_values_raise_a_renderable_error(module, container, depth):
    value = "original"
    for _ in range(depth):
        value = container([value])
    with pytest.raises(ValidationError) as caught:
        module.validate("Identifier", value)
    assert str(caught.value) == "JSON nesting exceeds the supported structural depth"
    assert "original" not in repr(caught.value)


@pytest.mark.parametrize("module", [v1, v2])
def test_cyclic_input_is_rejected_without_recursive_error_context(module):
    value = []
    value.append(value)
    with pytest.raises(ValidationError) as caught:
        module.validate("Identifier", value)
    assert "structural depth" in str(caught.value)


@pytest.mark.parametrize("module", [v1, v2])
def test_all_current_wire_shapes_fit_below_the_depth_guard(module):
    # A future recursive or open nested shape requires an explicit guard review.
    def depth(shape, references=()):
        if "$ref" in shape:
            name = shape["$ref"].removeprefix("#/$defs/")
            assert name not in references
            return depth(module.SCHEMA["$defs"][name], (*references, name))
        values = [0]
        for keyword in ("anyOf", "oneOf", "allOf"):
            values.extend(depth(child, references) for child in shape.get(keyword, []))
        if shape.get("type") == "object":
            assert shape["additionalProperties"] is False
            values.extend(1 + depth(child, references) for child in shape["properties"].values())
        if shape.get("type") == "array":
            values.append(1 + depth(shape["items"], references))
        return max(values)

    assert max(depth(shape) for shape in module.SCHEMA["$defs"].values()) < v1.MAX_JSON_DEPTH
