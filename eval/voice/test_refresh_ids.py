import unittest

from refresh_ids import refresh


class RefreshIds(unittest.TestCase):
    def follow(self, pid):
        return {'a': 'a', 'old-b': 'b', 'b': 'b', 'gone': None}.get(pid)

    def test_keeps_redirects_drops_and_dedupes(self):
        cases = [{'id': 'v1', 'items': [{'name': 'x', 'product': ['a', 'old-b', 'b', 'gone']}, {'name': 'custom', 'product': None}]}]
        out, kept, moved, dropped, emptied = refresh(cases, self.follow)
        self.assertEqual(out[0]['items'][0]['product'], ['a', 'b'])
        self.assertIsNone(out[0]['items'][1]['product'])
        self.assertEqual((kept, moved, dropped), (2, 1, 1))
        self.assertEqual(emptied, [])

    def test_reports_an_item_that_lost_every_id(self):
        cases = [{'id': 'v2', 'items': [{'name': 'y', 'product': ['gone']}]}]
        _, _, _, _, emptied = refresh(cases, self.follow)
        self.assertEqual(emptied, ['v2 y'])


if __name__ == '__main__':
    unittest.main()
