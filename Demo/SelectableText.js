import React from 'react'
import { View, Text, requireNativeComponent, Platform } from 'react-native'
import { v4 } from 'uuid'
import memoize from 'fast-memoize'

const RNSelectableText = requireNativeComponent('RNSelectableText')

/**
 * numbers: array({start: int, end: int, id: string, color: string})
 */
const combineHighlights = memoize(numbers => {
  return numbers
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .reduce(function(combined, next) {
      if (!combined.length || combined[combined.length - 1].end <= next.start) combined.push(next)
      else {
        var prev = combined.pop()
        combined.push({
          start: prev.start,
          end: Math.max(prev.end, next.end),
          id: next.id,
          highlightColor: next.color || 'yellow',
        })
      }
      return combined
    }, [])
})

/**
 * highlights: array({start: int, end: int, id: string, color: string })
 * emphases: array({start: int, end: int, id: string, style: object() })
 */
const combineStyles = memoize((highlights, emphases) => {
  if (!highlights) {
    highlights = [];
  }
  if (!emphases) {
    emphases = [];
  }
  const combinedHighlights = combineHighlights(highlights);
  const combinedArray = [];
  const highlightOverlapIndices = [];

  emphases.forEach((emphasis) => {
    let highlightOverlaps = combinedHighlights.filter((highlight, idx) => {
      if ((emphasis.start <= highlight.start && highlight.start < emphasis.end) || (emphasis.start < highlight.end && highlight.end <= emphasis.end)
          || (highlight.start <= emphasis.start && emphasis.start < highlight.end) || (highlight.start < emphasis.end && emphasis.end <= highlight.end)
      ) {
        highlightOverlapIndices.push(idx);
        return true;
      }
    });
    if (!highlightOverlaps.length) combinedArray.push({start: emphasis.start, end: emphasis.end, styles: {highlight: false, emphases: emphasis.style}});
    else {
      let startEndIndices = [];
      startEndIndices.push(emphasis.start);
      startEndIndices.push(emphasis.end);
      highlightOverlaps.forEach((highlight) => {
        startEndIndices.push(highlight.start);
        startEndIndices.push(highlight.end);
      });

      startEndIndices = startEndIndices.sort((a,b)=>a-b).filter((elem, pos, array) => array.indexOf(elem) == pos);

      startEndIndices.forEach((startEndIdx, idx) => {
        if (startEndIndices[idx + 1]) {
          let highlight = highlightOverlaps.find((highlight) => highlight.start <= startEndIdx && startEndIdx < highlight.end)
          let isHighlight = !!highlight;
          let isEmphasis = emphasis.start <= startEndIdx && startEndIdx < emphasis.end;

          // need to find existing:
          let styleExist = combinedArray.find((style) => style.start === startEndIdx);
          if (styleExist) {
            let prev = combinedArray.pop();
            startEndIdx = prev.start;
          }

          combinedArray.push({
            start: startEndIdx,
            end: startEndIndices[idx + 1],
            styles: {
              highlight: isHighlight,
              highlightColor: isHighlight ? highlight.color : 'yellow',
              emphases: isEmphasis ? emphasis.style : {},
            },
            id: isHighlight ? highlight.id : null,
          });
        }
      });
    }
  });

  combinedHighlights.forEach((highlight, idx) => {
    if (!highlightOverlapIndices.includes(idx)) {
      combinedArray.push({
        start: highlight.start,
        end: highlight.end,
        styles: {
          highlight: true,
          highlightColor: highlight.color || 'yellow',
          emphases: {},
        },
        id: highlight.id,
      })
    }
  });

  combinedArray.sort((a, b) => a.start - b.start || a.end - b.end);
  return combinedArray;
});

/**
 * value: string
 * highlights: array({start: int, end: int, id: any})
 */
const mapHighlightsRanges = (value, highlights) => {
  const combinedHighlights = combineHighlights(highlights)

  if (combinedHighlights.length === 0) return [{ isHighlight: false, text: value }]

  const data = [{ isHighlight: false, text: value.slice(0, combinedHighlights[0].start) }]

  combinedHighlights.forEach(({ start, end }, idx) => {
    data.push({
      isHighlight: true,
      text: value.slice(start, end),
    })

    if (combinedHighlights[idx + 1]) {
      data.push({
        isHighlight: false,
        text: value.slice(end, combinedHighlights[idx + 1].start),
      })
    }
  })

  data.push({
    isHighlight: false,
    text: value.slice(combinedHighlights[combinedHighlights.length - 1].end, value.length),
  })

  return data.filter(x => x.text)
}

/**
 * value: string
 * highlights: array({start: int, end: int, id: any})
 * emphases: array({start: int, end: int, style: object()})
 */
const mapHighlightsEmphasesRanges = (value, highlights, emphases) => {
  const combinedStyles = combineStyles(highlights, emphases)

  const data = [{ isHighlight: false, style: {}, text: value.slice(0, combinedStyles[0].start) }]

  combinedStyles.forEach(({ start, end, styles, id }, idx) => {
    data.push({
      isHighlight: styles.highlight,
      highlightColor: styles.highlightColor || 'yellow',
      emphases: {...styles.emphases},
      text: value.slice(start, end),
      id: id,
    })

    if (combinedStyles[idx + 1]) {
      data.push({
        isHighlight: false,
        emphases: {},
        text: value.slice(end, combinedStyles[idx + 1].start),
        id: id,
      })
    }
  })

  data.push({
    isHighlight: false,
    emphases: {},
    text: value.slice(combinedStyles[combinedStyles.length - 1].end, value.length),
  })

  return data.filter(x => x.text)
}

/**
 * Props
 * ...TextProps
 * onSelection: ({ content: string, eventType: string, selectionStart: int, selectionEnd: int }) => void
 * children: ReactNode
 * highlights: array({ id, start, end })
 * highlightColor: string
 * onHighlightPress: string => void
 * textValueProp: string
 * TextComponent: ReactNode
 * textComponentProps: object
 */
export const SelectableText = ({
  onSelection, onHighlightPress, textValueProp, value, TextComponent,
  textComponentProps, ...props
}) => {
  const usesTextComponent = !TextComponent;
  TextComponent = TextComponent || Text;
  textValueProp = textValueProp || 'children';  // default to `children` which will render `value` as a child of `TextComponent`
  const onSelectionNative = ({
    nativeEvent: { content, eventType, selectionStart, selectionEnd },
  }) => {
    onSelection && onSelection({ content, eventType, selectionStart, selectionEnd })
  }

  const onHighlightPressNative = onHighlightPress
    ? Platform.OS === 'ios'
      ? ({ nativeEvent: { clickedRangeStart, clickedRangeEnd } }) => {
          if (!props.highlights || props.highlights.length === 0) return

          const mergedHighlights = combineHighlights(props.highlights)

          const hightlightInRange = mergedHighlights.find(
            ({ start, end }) => clickedRangeStart >= start - 1 && clickedRangeEnd <= end + 1,
          )

          if (hightlightInRange) {
            onHighlightPress(hightlightInRange.id)
          }
        }
      : onHighlightPress
    : () => {}

  // highlights feature is only supported if `TextComponent == Text`
  let textValue = value;
  if (usesTextComponent) {
    textValue = (
      (props.highlights && props.highlights.length > 0) || (props.emphases && props.emphases.length > 0)
        ? mapHighlightsEmphasesRanges(value, props.highlights, props.emphases).map(({ id, isHighlight, highlightColor, emphases, text }) => {
          if (isHighlight) {
            emphases.backgroundColor = highlightColor;
          }
          return (
            <Text
              key={v4()}
              selectable
              style={emphases}
              onPress={() => {
                if (isHighlight) {
                  onHighlightPress && onHighlightPress(id)
                }
              }}
            >
              {text}
            </Text>
          )
        })
      : [value]
    );
    if (props.appendToChildren) {
      textValue.push(props.appendToChildren);
    }
  }
  return (
    <RNSelectableText
      {...props}
      onHighlightPress={onHighlightPressNative}
      selectable
      onSelection={onSelectionNative}
    >
      <TextComponent
        key={v4()}
        {...{[textValueProp]: textValue, ...textComponentProps}}
      />
    </RNSelectableText>
  )
}
