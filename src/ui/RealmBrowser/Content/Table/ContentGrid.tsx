////////////////////////////////////////////////////////////////////////////
//
// Copyright 2018 Realm Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
////////////////////////////////////////////////////////////////////////////

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import React from 'react';
import {
  Grid,
  GridCellProps,
  GridCellRangeRenderer,
  GridCellRenderer,
  GridProps,
  Index
} from 'react-virtualized';

import { EditMode } from '..';
import { IPropertyWithName } from '../..';

import {
  CellChangeHandler,
  CellClickHandler,
  CellContextMenuHandler,
  CellHighlightedHandler,
  CellValidatedHandler,
  IHighlight,
  ReorderingEndHandler,
  ReorderingStartHandler,
  RowMouseDownHandler
} from '.';
import { Cell } from './Cell';
import { Row } from './Row';
import {
  GridRowRenderer,
  IGridRowProps,
  rowCellRangeRenderer
} from './rowCellRangeRenderer';

export interface IContentGridProps extends Partial<GridProps> {
  columnWidths: number[];
  dataVersion?: number;
  editMode: EditMode;
  filteredSortedResults: Realm.OrderedCollection<any>;
  getCellValue: (object: any, props: GridCellProps) => string;
  gridRef: (grid: Grid | null) => void;
  height: number;
  highlight?: IHighlight;
  isSortable?: boolean;
  isSorting?: boolean;
  onCellChange?: CellChangeHandler;
  onCellClick?: CellClickHandler;
  onCellHighlighted?: CellHighlightedHandler;
  onCellValidated?: CellValidatedHandler;
  onContextMenu?: CellContextMenuHandler;
  onRowMouseDown?: RowMouseDownHandler;
  onReorderingEnd?: ReorderingEndHandler;
  onReorderingStart?: ReorderingStartHandler;
  onResetHighlight?: () => void;
  properties: IPropertyWithName[];
  rowHeight: number;
  width: number;
}

const isRowHighlighted = (
  highlight: IHighlight | undefined,
  rowIndex: number
): boolean => {
  return highlight ? highlight.rows.has(rowIndex) : false;
};

export class ContentGrid extends React.PureComponent<IContentGridProps> {
  private cellRangeRenderer?: GridCellRangeRenderer;
  private cellRenderers: GridCellRenderer[] = [];
  // Cached so SortableContext doesn't see a new items array on every render.
  private getSortableItems = memoizeItems();

  public UNSAFE_componentWillMount() {
    this.generateRenderers(this.props);
  }

  public UNSAFE_componentWillUpdate(nextProps: IContentGridProps) {
    if (this.props.properties !== nextProps.properties) {
      this.generateRenderers(nextProps);
    }
  }

  public render() {
    const { filteredSortedResults, gridRef, highlight } = this.props;

    // Create an object of props that will be passed to the container wrapping the grid
    const containerProps = {
      // Using mouse down as the rows can prevent clicks on these
      onMouseDown: this.onContainerMouseDown
    };

    const rowCount = filteredSortedResults.length;
    const items = this.getSortableItems(rowCount);

    return (
      <SortableGridDnd
        items={items}
        onReorderingStart={this.props.onReorderingStart}
        onReorderingEnd={this.props.onReorderingEnd}
      >
        <Grid
          {...this.props}
          cellRangeRenderer={this.cellRangeRenderer}
          cellRenderer={this.getCellRenderer}
          className="RealmBrowser__Table__ContentGrid"
          columnWidth={this.getColumnWidth}
          columnCount={this.props.properties.length}
          containerProps={containerProps}
          ref={gridRef}
          rowCount={rowCount}
          scrollToAlignment={
            highlight && highlight.scrollTo && highlight.scrollTo.center
              ? 'center'
              : 'auto'
          }
          noContentRenderer={this.getNoContentDiv}
        />
      </SortableGridDnd>
    );
  }

  private generateRenderers(props: IContentGridProps) {
    const { properties } = props;

    const rowRenderer: GridRowRenderer = (rowProps: IGridRowProps) => {
      const { highlight, isSortable, isSorting, onRowMouseDown } = this.props;

      return (
        <Row
          isHighlighted={isRowHighlighted(highlight, rowProps.rowIndex)}
          isSortable={isSortable}
          isSorting={isSorting}
          onRowMouseDown={onRowMouseDown}
          {...rowProps}
        />
      );
    };

    this.cellRangeRenderer = rowCellRangeRenderer(rowRenderer);

    this.cellRenderers = properties.map((property) => {
      return (cellProps: GridCellProps) => {
        try {
          const {
            editMode,
            filteredSortedResults,
            getCellValue,
            highlight,
            onCellChange,
            onCellClick,
            onCellHighlighted,
            onCellValidated,
            onContextMenu
          } = this.props;
          const { rowIndex, columnIndex } = cellProps;
          const rowObject = filteredSortedResults[cellProps.rowIndex];
          const cellValue = getCellValue(rowObject, cellProps);
          const isCellHighlighted = highlight
            ? isRowHighlighted(highlight, rowIndex)
            : false;

          return (
            <Cell
              kind="property"
              editMode={property.isPrimaryKey ? EditMode.Disabled : editMode}
              isHighlighted={isCellHighlighted}
              key={cellProps.key}
              onCellClick={(e) => {
                if (onCellClick) {
                  onCellClick(
                    {
                      cellValue,
                      columnIndex,
                      property,
                      rowIndex,
                      rowObject
                    },
                    e
                  );
                }
              }}
              onValidated={(valid) => {
                if (onCellValidated) {
                  onCellValidated(rowIndex, columnIndex, valid);
                }
              }}
              onContextMenu={(e) => {
                e.stopPropagation();
                // Open the context menu
                if (onContextMenu) {
                  onContextMenu(e, {
                    cellValue,
                    columnIndex,
                    property,
                    rowIndex,
                    rowObject
                  });
                }
              }}
              onHighlighted={() => {
                if (onCellHighlighted) {
                  onCellHighlighted({
                    rowIndex,
                    columnIndex
                  });
                }
              }}
              onUpdateValue={(value) => {
                if (onCellChange) {
                  onCellChange({
                    cellValue: value,
                    parent: filteredSortedResults,
                    property,
                    rowIndex
                  });
                }
              }}
              property={property}
              style={cellProps.style}
              value={cellValue}
            />
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Expected an Error';
          return <Cell kind="error" style={cellProps.style} error={message} />;
        }
      };
    });
  }

  private getColumnWidth = ({ index }: Index) => {
    return this.props.columnWidths[index];
  };

  private getCellRenderer = (cellProps: GridCellProps) => {
    return this.cellRenderers[cellProps.columnIndex](cellProps);
  };

  private getNoContentDiv = () => {
    // Accumulate the width of all columns
    const widthSum = this.props.columnWidths.reduce((sum, columnWidth) => {
      return sum + columnWidth;
    }, 0);
    // Make it as wide as the content grid or sum of column widths
    const width = Math.max(this.props.width, widthSum);
    // Render an empty div
    return (
      <div
        style={{
          height: this.props.height,
          width
        }}
      />
    );
  };

  private onContainerMouseDown: React.EventHandler<
    React.MouseEvent<HTMLElement>
  > = () => {
    const { onResetHighlight } = this.props;
    if (onResetHighlight) {
      onResetHighlight();
    }
  };
}

// Cache the items array between renders to avoid invalidating SortableContext
// when only unrelated props change.
function memoizeItems() {
  let cachedCount = -1;
  let cachedItems: number[] = [];
  return (count: number) => {
    if (count !== cachedCount) {
      cachedCount = count;
      cachedItems = Array.from({ length: count }, (_, i) => i);
    }
    return cachedItems;
  };
}

interface ISortableGridDndProps {
  items: number[];
  onReorderingStart?: ReorderingStartHandler;
  onReorderingEnd?: ReorderingEndHandler;
  children: React.ReactNode;
}

const SortableGridDnd: React.FC<ISortableGridDndProps> = ({
  items,
  onReorderingStart,
  onReorderingEnd,
  children
}) => {
  // Mirror react-sortable-hoc's `distance={5}` so clicks aren't mistaken for drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = () => {
    if (onReorderingStart) {
      onReorderingStart();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      if (onReorderingEnd) {
        const index = Number(active.id);
        onReorderingEnd({ oldIndex: index, newIndex: index });
      }
      return;
    }
    if (onReorderingEnd) {
      onReorderingEnd({
        oldIndex: Number(active.id),
        newIndex: Number(over.id)
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
};
