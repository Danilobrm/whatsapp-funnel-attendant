# Rule — Loading states use skeletons on the target element, not on the wrapper

Every asynchronous UI (fetch, mutation in flight, deferred computation) MUST render a skeleton placeholder while data is loading. The skeleton MUST occupy the exact position of the element that will eventually appear — never the parent container or an outer wrapper.

## Correct pattern

The skeleton replaces the leaf element (card, row, avatar, chart bar), while the rest of the layout (page shell, section headers, sidebar, filters) stays fully rendered.

```tsx
// ✅ CORRECT — skeleton lives at the element that is loading
<Card>
  <CardHeader title={t("orders.recent")} />
  <CardBody>
    {isLoading
      ? <QuestionListSkeleton rows={5} />
      : <QuestionList items={data} />}
  </CardBody>
</Card>
```

## Wrong pattern

```tsx
// ❌ WRONG — skeleton on the wrapper hides the layout, causes big CLS jumps
{isLoading
  ? <PageSkeleton />
  : <OrdersPage data={data} />}
```

## Rules

1. Skeleton shape MUST match the real element: same dimensions, same border radius, same padding, same grid position. The transition from skeleton → real content should not shift adjacent elements.
2. Skeleton components live next to the real component (e.g. `OrderList.tsx` + `OrderListSkeleton.tsx`) or exported from the same file.
3. Use the design tokens from `theme.css` for the skeleton background (`bg-surface` with reduced opacity, or a dedicated `--color-skeleton` token). Do NOT hardcode gray.
4. Static parts of the page (titles, headers, navigation, empty-state text) MUST remain visible while children load. The user must still know what page they are on.
5. Never wrap a full route/page in a skeleton — route-level loading = spinner only if truly nothing on the page can render yet, otherwise per-widget skeletons.
6. Skeletons animate subtly (pulse or shimmer). Do not use spinners inside skeletons — pick one.

## When to use a spinner instead

- Button in a submitting state (spinner inside the button, button stays in place).
- Modal that has literally nothing to show until data arrives (rare — usually you can render the modal shell + a skeleton body).

## Why

Wrapping the parent creates a full-page flash that destroys perceived performance, causes layout shift, and hides navigation. Skeleton-at-target keeps the app frame stable, communicates structure ahead of data, and gives an accurate preview of what is coming.
