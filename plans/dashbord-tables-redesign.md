# The Dashboard Tables redesign.

First read the `table-ui-design-guide.md` from the `docs` folder thoroughly.

## 1. Membership Expirations Card.

- The Card header and Icon are too small. Doesn't respect the visual hierarchy, Affordance & Signifier.
- Below the Card header have a Date range filter, and a search bar. We are making data table instead of simple table.

Improving the table data representation:

1. Client name should be bold.
2. The contact should have it's own column with header `Contact`. Mobile number should be above, and email should be below. The primary contact method is mobile number, and it should follow principles of visual hierarchy.
3. Expiration rows are distacting. Make the pill not rounded and blocky like rest of the design. Keep the date font simple.
4. The plan column is also too cluttered. The data is good but it doesn't follow the visual hierarchy properly as the `Bought <date>` feels to big.
5. Actions should also have `Eye ball icon` as view detail and Follow up should be bell icon, don't add the text, only icon. When hovered over the icons, The tool-tip component from shadcn.

## 2. Payments Due.

- The Card header and Icon are too small. Doesn't respect the visual hierarchy, Affordance & Signifier.
- Below the Card header have a Date range filter, and a search bar. We are making data table instead of simple table.

Improving the table data representation:

1. Client name should be bold.
2. The contact should have it's own column with header `Contact`. Mobile number should be above, and email should be below. The primary contact method is mobile number, and it should follow principles of visual hierarchy.
3. The plan column is also too cluttered. The data is good but it doesn't follow the visual hierarchy properly as the `Bought <date>` feels to big.
4. Actions should also have `Eye ball icon` as view detail and Follow up should be bell icon, don't add the text, only icon. When hovered over the icons, The tool-tip component from shadcn.

## Common for both tables.

- Add pagination. Check from the shadcn documentation.
- Research the important micro-interactions necessary in Data tables, and then how to implement theme by shadcn.
